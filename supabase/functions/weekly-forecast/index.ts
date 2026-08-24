// Weekly 2027 (2026-27 season) forecast refresh -- reduced-scope automated
// version. See scraper/build_forecast.py for the full (ESPN-roster-based)
// version, which stays the source of truth for manual runs; this Edge
// Function deliberately does NOT try to replicate it.
//
// Why the scope is reduced: ESPN's roster API -- the actual ground truth
// for "who's on which team right now" -- returns 403 to every cloud host
// tried so far. Confirmed on both Supabase's Deno Deploy (this function)
// and Vercel (tested via a throwaway API route); only genuinely non-cloud
// (local/residential) IPs get through. Same class of problem as the
// GitHub-Actions-vs-Torvik block from step 4, different provider pair.
// User's call (asked directly): accept a reduced automated scope rather
// than pay for a residential proxy.
//
// So this job can only see what Torvik itself exposes, no roster lookup:
// - players already in our DB (team_id set from the regular daily cron,
//   i.e. they played in CURRENT_SEASON) are the only candidates -- there's
//   no way to discover a brand-new incoming transfer without ESPN.
// - a player whose class_year is "Sr" is assumed to have graduated and is
//   excluded. Imperfect (misses grad-transfers/extra-eligibility seniors
//   who are still playing somewhere), but roster-absence isn't available
//   here to check that properly.
// - tridyeartransfers.json (trid -> year their current stint began) is
//   still checked: a player whose stint year has moved to >= FORECAST_SEASON
//   is excluded from their old team, since Torvik itself confirms they've
//   moved on -- we just don't know where.
//
// Net effect: this job correctly DROPS departed players (graduated or
// transferred) every week, but can never ADD a transfer to their new team
// automatically. That half only updates when scraper/build_forecast.py is
// run manually with ESPN access.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const SOURCE_SEASON = 2026;
const FORECAST_SEASON = 2027;
const BARTHAG_EXPONENT = 11.5;
const FULL_COVERAGE_MINUTES = 300;

const TRANSFERS_URL = "https://barttorvik.com/tridyeartransfers.json";

const TEAM_TO_PLAYER_FIELD: Record<string, string> = {
  adj_o: "ortg", efg_o: "efg", tov_o: "tov_pct", oreb_o: "oreb_pct", ftr_o: "ftr",
};
const CARRY_FORWARD_TEAM_FIELDS = ["adj_d", "adj_t", "efg_d", "tov_d", "oreb_d", "ftr_d"];
const PLAYER_STAT_FIELDS = [
  "minutes_pct", "ortg", "usg", "efg", "ts", "oreb_pct", "dreb_pct",
  "ast_pct", "tov_pct", "blk_pct", "stl_pct", "ftr", "pts_per_game",
];
// deno-lint-ignore no-explicit-any
async function fetchJson(url: string): Promise<any> {
  const resp = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (resp.status !== 200) throw new Error(`Unexpected status ${resp.status} for ${url}`);
  return await resp.json();
}

Deno.serve(async (_req) => {
  try {
    return await run();
  } catch (e) {
    const msg = e instanceof Error ? `${e.message}\n${e.stack}` : JSON.stringify(e);
    console.log("FATAL:", msg);
    return new Response(JSON.stringify({ fatalError: msg }, null, 2), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
});

async function run(): Promise<Response> {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  console.log("Fetching Torvik's transfer-year tracking...");
  const transfersRaw = await fetchJson(TRANSFERS_URL);
  const trantridyear: Record<string, number> = transfersRaw[0];
  console.log(`  ${Object.keys(trantridyear).length} tracked stints`);

  console.log("Loading current roster + last season's stats from our own DB...");
  const { data: candidates, error: candErr } = await supabase
    .from("players")
    .select("player_id, full_name, team_id, position, class_year, player_stats(season, minutes_pct, ortg, usg, efg, ts, oreb_pct, dreb_pct, ast_pct, tov_pct, blk_pct, stl_pct, ftr, pts_per_game)")
    .not("team_id", "is", null);
  if (candErr) throw candErr;

  // --- Reset, so departures show up as newly-absent rather than stale ---
  await supabase.from("players").update({ forecast_team_id: null }).not("player_id", "is", null);
  await supabase.from("player_stats").delete().eq("season", FORECAST_SEASON);

  let keptTotal = 0;
  let excludedSeniors = 0;
  let excludedTransferred = 0;
  let noSourceStats = 0;
  const rosterByTeam = new Map<string, Record<string, unknown>[]>();
  const playerRows: Record<string, unknown>[] = [];
  const playerStatsRows: Record<string, unknown>[] = [];

  for (const c of candidates ?? []) {
    const stintYear = trantridyear[c.player_id];
    if (stintYear && stintYear >= FORECAST_SEASON) {
      excludedTransferred++;
      continue;
    }
    if (c.class_year === "Sr") {
      excludedSeniors++;
      continue;
    }
    const statsRows = Array.isArray(c.player_stats) ? c.player_stats : c.player_stats ? [c.player_stats] : [];
    const stats = statsRows.find((s: { season: number }) => s.season === SOURCE_SEASON);
    if (!stats) {
      noSourceStats++;
      continue;
    }

    keptTotal++;
    playerRows.push({
      player_id: c.player_id,
      full_name: c.full_name,
      position: c.position,
      class_year: c.class_year,
      forecast_team_id: c.team_id,
      updated_at: new Date().toISOString(),
    });
    const statsRow = {
      player_id: c.player_id,
      season: FORECAST_SEASON,
      ...Object.fromEntries(PLAYER_STAT_FIELDS.map((f) => [f, stats[f]])),
      updated_at: new Date().toISOString(),
    };
    playerStatsRows.push(statsRow);

    if (!rosterByTeam.has(c.team_id)) rosterByTeam.set(c.team_id, []);
    rosterByTeam.get(c.team_id)!.push(statsRow);
  }

  if (playerRows.length) {
    const { error } = await supabase.from("players").upsert(playerRows, { onConflict: "player_id" });
    if (error) throw error;
  }
  if (playerStatsRows.length) {
    const { error } = await supabase
      .from("player_stats")
      .upsert(playerStatsRows, { onConflict: "player_id,season" });
    if (error) throw error;
  }
  console.log(
    `Kept ${keptTotal}, excluded ${excludedSeniors} seniors, ${excludedTransferred} confirmed-transferred-out, ` +
      `${noSourceStats} missing source stats`,
  );

  // --- Team-level forecast ---
  const { data: lastYearTeamStats } = await supabase.from("team_stats").select("*").eq("season", SOURCE_SEASON);
  const lastYearByTeam = new Map<string, Record<string, unknown>>();
  for (const r of lastYearTeamStats ?? []) lastYearByTeam.set(r.team_id as string, r);

  const teamRows: Record<string, unknown>[] = [];
  for (const [teamId, roster] of rosterByTeam) {
    const lastYear = lastYearByTeam.get(teamId);
    if (!lastYear) continue;

    const totalMinutes = roster.reduce((sum, r) => sum + (Number(r.minutes_pct) || 0), 0);
    const coverage = roster.length ? Math.min(1, totalMinutes / FULL_COVERAGE_MINUTES) : 0;

    const row: Record<string, unknown> = { team_id: teamId, season: FORECAST_SEASON };
    for (const [teamField, playerField] of Object.entries(TEAM_TO_PLAYER_FIELD)) {
      const baseline = Number(lastYear[teamField]);
      const weighted =
        roster.length && totalMinutes > 0
          ? roster.reduce((sum, r) => sum + (Number(r.minutes_pct) || 0) * Number(r[playerField] || 0), 0) / totalMinutes
          : baseline;
      row[teamField] = coverage * weighted + (1 - coverage) * baseline;
    }
    for (const field of CARRY_FORWARD_TEAM_FIELDS) {
      row[field] = Number(lastYear[field]);
    }
    const adjOK = Number(row.adj_o) ** BARTHAG_EXPONENT;
    const adjDK = Number(row.adj_d) ** BARTHAG_EXPONENT;
    row.barthag = adjOK / (adjOK + adjDK);

    teamRows.push(row);
  }

  if (teamRows.length) {
    const { error } = await supabase.from("team_stats").upsert(teamRows, { onConflict: "team_id,season" });
    if (error) throw error;
  }
  console.log(`Team forecasts: ${teamRows.length} teams projected forward`);

  return new Response(
    JSON.stringify(
      { keptTotal, excludedSeniors, excludedTransferred, noSourceStats, teamsProjected: teamRows.length },
      null,
      2,
    ),
    { headers: { "Content-Type": "application/json" } },
  );
}
