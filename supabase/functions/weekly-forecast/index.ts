// Weekly 2027 (2026-27 season) forecast refresh -- roster-ground-truth
// version. Replaces the earlier "departures only" version, which could drop
// a graduated/transferred player from their old team but had no way to add
// an incoming transfer to their new one (ESPN's roster API -- the obvious
// ground truth -- 403s every cloud host we tried: Deno Deploy and Vercel
// both confirmed blocked, only non-cloud IPs get through).
//
// The fix: each P4 school's own athletics site (rolltide.com, goheels.com,
// etc.) publishes its own basketball roster page, is NOT blocked from Deno
// Deploy, and in spot checks was *more* current than ESPN (e.g. goheels.com
// already listed a transfer ESPN's roster endpoint hadn't picked up yet).
// These sites run on one of two CMS platforms (Sidearm Sports or WMT
// Digital, ~43/25 of the 68 P4 schools respectively) with several template
// variants each -- card view, list view, table view, at least one bespoke
// path scheme (Arkansas, Georgia Tech) -- so rather than chase every CSS
// class variant, this scrapes the one thing that's stable across all of
// them: every roster page links to a player's detail page via an href
// containing "roster" followed by a name-shaped slug
// (".../roster/matt-able/28588" or ".../roster/player/musa-sagnia" etc).
// That slug, normalized (lowercased, non-alnum stripped), is matched
// against our own players table (normalized the same way) to recover the
// player_id and last season's stats -- no second data source needed.
//
// Known gap: a handful of schools hadn't published a 2026-27 roster page at
// all yet as of this build (confirmed by hand: Alabama, LSU, Miami FL,
// and any others where the scrape below returns zero slugs). For those, we
// deliberately do NOT touch their players' forecast_team_id or forecast
// player_stats -- we leave whatever was there from the last successful run
// alone rather than wiping it, so a school being slow to publish doesn't
// erase that team's forecast the way a blanket reset would. Once a school
// publishes, the next Monday run picks it up automatically.
//
// A transfer arriving from outside our own players table (a non-P4 school,
// a JUCO, overseas) still can't be forecast -- we have no prior-season
// stats to carry forward for them. Same limitation the old ESPN-based
// scraper/build_forecast.py has; not something roster ground-truth alone
// can fix.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import ROSTER_URLS from "./school_roster_sources.json" with { type: "json" };

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const SOURCE_SEASON = 2026;
const FORECAST_SEASON = 2027;
const BARTHAG_EXPONENT = 11.5;
const FULL_COVERAGE_MINUTES = 300;

const TEAM_TO_PLAYER_FIELD: Record<string, string> = {
  adj_o: "ortg", efg_o: "efg", tov_o: "tov_pct", oreb_o: "oreb_pct", ftr_o: "ftr",
};
const CARRY_FORWARD_TEAM_FIELDS = ["adj_d", "adj_t", "efg_d", "tov_d", "oreb_d", "ftr_d"];
const PLAYER_STAT_FIELDS = [
  "minutes_pct", "ortg", "usg", "efg", "ts", "oreb_pct", "dreb_pct",
  "ast_pct", "tov_pct", "blk_pct", "stl_pct", "ftr", "pts_per_game",
];

const HREF_RE = /href="([^"]*roster[^"]*)"/gi;
const EXCLUDE_SEGMENTS = new Set([
  "roster", "player", "players", "coaches", "coach", "staff",
  "season", "seasons", "bio", "profile", "full-bio", "history",
]);

function normalizeKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function looksLikeNameSlug(seg: string): boolean {
  if (!/^[a-z][a-z0-9]*(-[a-z0-9]+){1,5}$/.test(seg)) return false;
  if (EXCLUDE_SEGMENTS.has(seg)) return false;
  if (/^\d{4}-\d{2}$/.test(seg)) return false;
  if (/^[a-z]-[a-z]+$/.test(seg) && seg.length < 8) return false; // sport codes like "m-baskbl"
  return true;
}

function extractSlugs(html: string): Set<string> {
  const slugs = new Set<string>();
  for (const match of html.matchAll(HREF_RE)) {
    let href = match[1].split("?")[0].split("#")[0];
    if (href.endsWith("/")) href = href.slice(0, -1);
    let parts = href.split("/").filter((p) => p.length > 0 && !p.startsWith("http"));
    if (parts.length && parts[0].includes(".")) parts = parts.slice(1); // strip domain
    const rosterIdx = parts.lastIndexOf("roster");
    if (rosterIdx === -1) continue;
    const tail = parts.slice(rosterIdx + 1);
    // A staff/coach detail page can share this same "/roster/.../<slug>/<id>"
    // shape (e.g. "/roster/staff/mark-mitchell/740") and happen to share a
    // name with an actual player elsewhere -- reject the whole href rather
    // than just skipping the "staff" segment, or the name segment right
    // after it would still get picked up as if it were a player.
    if (tail.some((seg) => seg === "staff" || seg === "coach" || seg === "coaches")) continue;
    for (const seg of tail) {
      if (/^\d+$/.test(seg)) continue;
      if (/^\d{4}-\d{2}$/.test(seg)) continue;
      if (EXCLUDE_SEGMENTS.has(seg)) continue;
      if (looksLikeNameSlug(seg)) slugs.add(seg);
    }
  }
  return slugs;
}

async function fetchRosterSlugs(url: string): Promise<Set<string>> {
  try {
    const resp = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (resp.status !== 200) return new Set();
    const html = await resp.text();
    return extractSlugs(html);
  } catch {
    return new Set();
  }
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

  console.log("Loading players + last season's stats from our own DB...");
  const { data: allPlayers, error: playersErr } = await supabase
    .from("players")
    .select(
      "player_id, full_name, team_id, forecast_team_id, position, class_year, " +
        "player_stats(season, minutes_pct, ortg, usg, efg, ts, oreb_pct, dreb_pct, ast_pct, tov_pct, blk_pct, stl_pct, ftr, pts_per_game)",
    );
  if (playersErr) throw playersErr;

  const byNormalizedName = new Map<string, typeof allPlayers[number]>();
  for (const p of allPlayers ?? []) {
    const key = normalizeKey(p.full_name);
    if (!byNormalizedName.has(key)) byNormalizedName.set(key, p);
  }

  console.log(`Scraping ${Object.keys(ROSTER_URLS).length} team roster pages...`);
  const teamIds = Object.keys(ROSTER_URLS) as (keyof typeof ROSTER_URLS)[];
  const BATCH_SIZE = 10;
  const slugsByTeam = new Map<string, Set<string>>();
  for (let i = 0; i < teamIds.length; i += BATCH_SIZE) {
    const batch = teamIds.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map((teamId) => fetchRosterSlugs((ROSTER_URLS as Record<string, string>)[teamId])),
    );
    batch.forEach((teamId, j) => slugsByTeam.set(teamId, results[j]));
  }

  const successfulTeams = new Set(
    [...slugsByTeam.entries()].filter(([, slugs]) => slugs.size > 0).map(([t]) => t),
  );
  const failedTeams = teamIds.filter((t) => !successfulTeams.has(t));
  console.log(`Roster pages with data: ${successfulTeams.size}/${teamIds.length}`);
  if (failedTeams.length) console.log(`No data (left untouched): ${failedTeams.join(", ")}`);

  // New forecast_team_id assignment, built only from successfully-scraped teams.
  const newAssignment = new Map<string, string>(); // player_id -> team_id
  let matched = 0;
  let unmatched = 0;
  for (const [teamId, slugs] of slugsByTeam) {
    if (!successfulTeams.has(teamId)) continue;
    for (const slug of slugs) {
      const key = normalizeKey(slug);
      const player = byNormalizedName.get(key);
      if (player) {
        newAssignment.set(player.player_id, teamId);
        matched++;
      } else {
        unmatched++;
      }
    }
  }
  console.log(`Matched ${matched} roster slugs to known players, ${unmatched} unmatched (no prior-season stats)`);

  // Players currently forecast onto a successfully-scraped team but not
  // reconfirmed by this run's scrape -> they've left, clear them.
  const clearedPlayerIds: string[] = [];
  for (const p of allPlayers ?? []) {
    if (
      p.forecast_team_id &&
      successfulTeams.has(p.forecast_team_id) &&
      newAssignment.get(p.player_id) !== p.forecast_team_id
    ) {
      clearedPlayerIds.push(p.player_id);
    }
  }

  if (clearedPlayerIds.length) {
    const { error } = await supabase
      .from("players")
      .update({ forecast_team_id: null, updated_at: new Date().toISOString() })
      .in("player_id", clearedPlayerIds);
    if (error) throw error;
    const { error: delErr } = await supabase
      .from("player_stats")
      .delete()
      .eq("season", FORECAST_SEASON)
      .in("player_id", clearedPlayerIds);
    if (delErr) throw delErr;
  }
  console.log(`Cleared ${clearedPlayerIds.length} players no longer on their forecasted team's roster`);

  // Build+write player rows and stats for the new assignment.
  const playerRows: Record<string, unknown>[] = [];
  const playerStatsRows: Record<string, unknown>[] = [];
  const rosterByTeam = new Map<string, Record<string, unknown>[]>();

  for (const [playerId, teamId] of newAssignment) {
    const player = (allPlayers ?? []).find((p) => p.player_id === playerId)!;
    const statsRows = Array.isArray(player.player_stats)
      ? player.player_stats
      : player.player_stats
      ? [player.player_stats]
      : [];
    const stats = statsRows.find((s: { season: number }) => s.season === SOURCE_SEASON);
    if (!stats) continue; // matched a player we've never recorded a season for -- can't forecast

    playerRows.push({
      player_id: player.player_id,
      full_name: player.full_name,
      position: player.position,
      class_year: player.class_year,
      forecast_team_id: teamId,
      updated_at: new Date().toISOString(),
    });
    const statsRow = {
      player_id: player.player_id,
      season: FORECAST_SEASON,
      ...Object.fromEntries(PLAYER_STAT_FIELDS.map((f) => [f, (stats as Record<string, unknown>)[f]])),
      updated_at: new Date().toISOString(),
    };
    playerStatsRows.push(statsRow);
    if (!rosterByTeam.has(teamId)) rosterByTeam.set(teamId, []);
    rosterByTeam.get(teamId)!.push(statsRow);
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
  console.log(`Wrote forecast roster for ${playerRows.length} players across ${rosterByTeam.size} teams`);

  // --- Team-level forecast, only for successfully-scraped teams ---
  const { data: lastYearTeamStats } = await supabase.from("team_stats").select("*").eq("season", SOURCE_SEASON);
  const lastYearByTeam = new Map<string, Record<string, unknown>>();
  for (const r of lastYearTeamStats ?? []) lastYearByTeam.set(r.team_id as string, r);

  const teamRows: Record<string, unknown>[] = [];
  for (const teamId of successfulTeams) {
    const roster = rosterByTeam.get(teamId) ?? [];
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
      {
        teamsScraped: teamIds.length,
        teamsWithData: successfulTeams.size,
        teamsWithoutData: failedTeams,
        slugsMatched: matched,
        slugsUnmatched: unmatched,
        playersCleared: clearedPlayerIds.length,
        playersForecast: playerRows.length,
        teamsProjected: teamRows.length,
      },
      null,
      2,
    ),
    { headers: { "Content-Type": "application/json" } },
  );
}
