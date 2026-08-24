// Weekly 2027 (2026-27 season) forecast refresh, ported from
// scraper/build_forecast.py -- see that file's docstring for the full
// history of why this exists and what it got wrong the first two times.
// Runs as a Supabase Edge Function on the same pattern as daily-scrape
// (plain fetch(), no browser needed -- ESPN and Torvik's JSON endpoints
// don't require one), scheduled weekly rather than daily since roster
// moves settle over weeks, not hours.
//
// Ground truth for "who's on which roster" is each team's CURRENT ESPN
// listing, cross-matched against Torvik's full D1 player pool (not just
// our 68 P4 teams -- that's what makes a transfer from outside P4
// representable at all) by normalized name. A second signal from
// Torvik's own tridyeartransfers.json (trid -> year their current stint
// began) catches departures ESPN hasn't reflected yet, dropping a player
// from their OLD team even when ESPN is stale about it -- but if ESPN
// hasn't added them to their new team either, they simply get no
// forecast rather than a guessed one. That gap should narrow on its own
// as ESPN's rosters firm up over the following weeks; that's the whole
// reason this runs on a schedule instead of once.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const SOURCE_SEASON = 2026;
const FORECAST_SEASON = 2027;
const BARTHAG_EXPONENT = 11.5;
const FULL_COVERAGE_MINUTES = 300;

const ESPN_ROSTER_URL =
  "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams/{id}/roster";
const FULL_POOL_URL =
  "https://barttorvik.com/getadvstats.php?year=2026&specialSource=0&conyes=0" +
  "&start=20251101&end=20260501&top=365&xvalue=All&page=all";
const TRANSFERS_URL = "https://barttorvik.com/tridyeartransfers.json";

const P4_TEAMS: { team_name: string; conference: string }[] = [
  { team_name: "Alabama", conference: "SEC" },
  { team_name: "Arizona", conference: "B12" },
  { team_name: "Arizona St.", conference: "B12" },
  { team_name: "Arkansas", conference: "SEC" },
  { team_name: "Auburn", conference: "SEC" },
  { team_name: "BYU", conference: "B12" },
  { team_name: "Baylor", conference: "B12" },
  { team_name: "Boston College", conference: "ACC" },
  { team_name: "California", conference: "ACC" },
  { team_name: "Cincinnati", conference: "B12" },
  { team_name: "Clemson", conference: "ACC" },
  { team_name: "Colorado", conference: "B12" },
  { team_name: "Duke", conference: "ACC" },
  { team_name: "Florida", conference: "SEC" },
  { team_name: "Florida St.", conference: "ACC" },
  { team_name: "Georgia", conference: "SEC" },
  { team_name: "Georgia Tech", conference: "ACC" },
  { team_name: "Houston", conference: "B12" },
  { team_name: "Illinois", conference: "B10" },
  { team_name: "Indiana", conference: "B10" },
  { team_name: "Iowa", conference: "B10" },
  { team_name: "Iowa St.", conference: "B12" },
  { team_name: "Kansas", conference: "B12" },
  { team_name: "Kansas St.", conference: "B12" },
  { team_name: "Kentucky", conference: "SEC" },
  { team_name: "LSU", conference: "SEC" },
  { team_name: "Louisville", conference: "ACC" },
  { team_name: "Maryland", conference: "B10" },
  { team_name: "Miami FL", conference: "ACC" },
  { team_name: "Michigan", conference: "B10" },
  { team_name: "Michigan St.", conference: "B10" },
  { team_name: "Minnesota", conference: "B10" },
  { team_name: "Mississippi", conference: "SEC" },
  { team_name: "Mississippi St.", conference: "SEC" },
  { team_name: "Missouri", conference: "SEC" },
  { team_name: "N.C. State", conference: "ACC" },
  { team_name: "Nebraska", conference: "B10" },
  { team_name: "North Carolina", conference: "ACC" },
  { team_name: "Northwestern", conference: "B10" },
  { team_name: "Notre Dame", conference: "ACC" },
  { team_name: "Ohio St.", conference: "B10" },
  { team_name: "Oklahoma", conference: "SEC" },
  { team_name: "Oklahoma St.", conference: "B12" },
  { team_name: "Oregon", conference: "B10" },
  { team_name: "Penn St.", conference: "B10" },
  { team_name: "Pittsburgh", conference: "ACC" },
  { team_name: "Purdue", conference: "B10" },
  { team_name: "Rutgers", conference: "B10" },
  { team_name: "SMU", conference: "ACC" },
  { team_name: "South Carolina", conference: "SEC" },
  { team_name: "Stanford", conference: "ACC" },
  { team_name: "Syracuse", conference: "ACC" },
  { team_name: "TCU", conference: "B12" },
  { team_name: "Tennessee", conference: "SEC" },
  { team_name: "Texas", conference: "SEC" },
  { team_name: "Texas A&M", conference: "SEC" },
  { team_name: "Texas Tech", conference: "B12" },
  { team_name: "UCF", conference: "B12" },
  { team_name: "UCLA", conference: "B10" },
  { team_name: "USC", conference: "B10" },
  { team_name: "Utah", conference: "B12" },
  { team_name: "Vanderbilt", conference: "SEC" },
  { team_name: "Virginia", conference: "ACC" },
  { team_name: "Virginia Tech", conference: "ACC" },
  { team_name: "Wake Forest", conference: "ACC" },
  { team_name: "Washington", conference: "B10" },
  { team_name: "West Virginia", conference: "B12" },
  { team_name: "Wisconsin", conference: "B10" },
];

// team_id (slugify(team_name)) -> ESPN's numeric team id. Hardcoded rather
// than resolved live via ESPN's bulk teams-list endpoint
// (site.api.espn.com/.../teams?limit=400): that endpoint 403s Deno Deploy's
// IP specifically (confirmed -- the per-team roster endpoint below does
// not), while this mapping is static anyway, so there's nothing to lose by
// hardcoding it. Extracted from teams.logo_url, which already encodes each
// team's ESPN id (.../teamlogos/ncaa/500/{espn_id}.png) from step 11's logo
// scrape.
const ESPN_TEAM_IDS: Record<string, string> = {
  "alabama": "333", "arizona": "12", "arizona-st": "9", "arkansas": "8",
  "auburn": "2", "baylor": "239", "boston-college": "103", "byu": "252",
  "california": "25", "cincinnati": "2132", "clemson": "228", "colorado": "38",
  "duke": "150", "florida": "57", "florida-st": "52", "georgia": "61",
  "georgia-tech": "59", "houston": "248", "illinois": "356", "indiana": "84",
  "iowa": "2294", "iowa-st": "66", "kansas": "2305", "kansas-st": "2306",
  "kentucky": "96", "louisville": "97", "lsu": "99", "maryland": "120",
  "miami-fl": "2390", "michigan": "130", "michigan-st": "127", "minnesota": "135",
  "mississippi": "145", "mississippi-st": "344", "missouri": "142", "n-c-state": "152",
  "nebraska": "158", "north-carolina": "153", "northwestern": "77", "notre-dame": "87",
  "ohio-st": "194", "oklahoma": "201", "oklahoma-st": "197", "oregon": "2483",
  "penn-st": "213", "pittsburgh": "221", "purdue": "2509", "rutgers": "164",
  "smu": "2567", "south-carolina": "2579", "stanford": "24", "syracuse": "183",
  "tcu": "2628", "tennessee": "2633", "texas": "251", "texas-a-m": "245",
  "texas-tech": "2641", "ucf": "2116", "ucla": "26", "usc": "30",
  "utah": "254", "vanderbilt": "238", "virginia": "258", "virginia-tech": "259",
  "wake-forest": "154", "washington": "264", "west-virginia": "277", "wisconsin": "275",
};

// Raw getadvstats.php array indices -- see scraper/scrape_all_p4.py /
// scraper/build_forecast.py for how each was verified.
const PLAYER_FIELD_INDEX: Record<string, number> = {
  gp: 3, minutes_pct: 4, ortg: 5, usg: 6, efg: 7, ts: 8,
  oreb_pct: 9, dreb_pct: 10, ast_pct: 11, tov_pct: 12,
  ftm: 13, two_pm: 16, three_pm: 19,
  blk_pct: 22, stl_pct: 23, ftr: 24,
  class_year: 25, height: 26, player_id: 32, position: 64,
};

const TEAM_TO_PLAYER_FIELD: Record<string, string> = {
  adj_o: "ortg", efg_o: "efg", tov_o: "tov_pct", oreb_o: "oreb_pct", ftr_o: "ftr",
};
const CARRY_FORWARD_TEAM_FIELDS = ["adj_d", "adj_t", "efg_d", "tov_d", "oreb_d", "ftr_d"];
const PLAYER_STAT_FIELDS = [
  "minutes_pct", "ortg", "usg", "efg", "ts", "oreb_pct", "dreb_pct",
  "ast_pct", "tov_pct", "blk_pct", "stl_pct", "ftr", "pts_per_game",
];
const TEAM_FIELD_ORDER = [
  "adj_o", "adj_d", "adj_t", "efg_o", "efg_d", "tov_o",
  "tov_d", "oreb_o", "oreb_d", "ftr_o", "ftr_d", "barthag",
];

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function normalizePlayerName(name: string): string {
  let n = name.toLowerCase().trim();
  n = n.replace(/[.']/g, "");
  n = n.replace(/\s+(jr|sr|ii|iii|iv)\.?$/, "");
  n = n.replace(/\s+/g, " ");
  return n;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// deno-lint-ignore no-explicit-any
async function fetchJson(url: string, maxRetries = 2, backoffMs = 5000): Promise<any> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const resp = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (resp.status === 200) return await resp.json();
    if ((resp.status === 403 || resp.status === 429) && attempt < maxRetries) {
      const wait = backoffMs * (attempt + 1);
      console.log(`  -> ${resp.status}, backing off ${wait}ms (attempt ${attempt + 1}/${maxRetries})...`);
      await sleep(wait);
      continue;
    }
    throw new Error(`Unexpected status ${resp.status} for ${url}`);
  }
}

type PoolStats = Record<string, unknown> & { player_id: string; pts_per_game: number | null };

function parsePoolRow(row: unknown[]): PoolStats {
  const p: Record<string, unknown> = {};
  for (const [field, idx] of Object.entries(PLAYER_FIELD_INDEX)) {
    p[field] = row[idx];
  }
  const gp = (p.gp as number) || 0;
  if (gp) {
    const totalPts = 2 * ((p.two_pm as number) || 0) + 3 * ((p.three_pm as number) || 0) + ((p.ftm as number) || 0);
    p.pts_per_game = Math.round((totalPts / gp) * 10) / 10;
  } else {
    p.pts_per_game = null;
  }
  p.player_id = String(p.player_id);
  return p as PoolStats;
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

  console.log("Fetching full D1 player pool (2025-26)...");
  const poolRaw: unknown[][] = await fetchJson(FULL_POOL_URL);
  const poolByName = new Map<string, PoolStats>();
  let dupes = 0;
  for (const row of poolRaw) {
    const norm = normalizePlayerName(row[0] as string);
    if (poolByName.has(norm)) {
      dupes++;
      continue;
    }
    poolByName.set(norm, parsePoolRow(row));
  }
  console.log(`  ${poolByName.size} distinct players (${dupes} duplicate-name collisions skipped)`);

  console.log("Fetching Torvik's own transfer-year tracking...");
  const transfersRaw = await fetchJson(TRANSFERS_URL);
  const trantridyear: Record<string, number> = transfersRaw[0];
  console.log(`  ${Object.keys(trantridyear).length} tracked stints`);

  console.log("Fetching current ESPN rosters (parallel batches)...");
  const rosters = new Map<string, string[]>(); // team_id -> [full_name, ...]
  const rosterErrors: string[] = [];
  const BATCH_SIZE = 12;
  for (let b = 0; b < P4_TEAMS.length; b += BATCH_SIZE) {
    const batch = P4_TEAMS.slice(b, b + BATCH_SIZE);
    await Promise.all(
      batch.map(async (t) => {
        const teamId = slugify(t.team_name);
        const espnId = ESPN_TEAM_IDS[teamId];
        if (!espnId) {
          rosterErrors.push(`${t.team_name}: no ESPN id`);
          return;
        }
        try {
          const roster = await fetchJson(ESPN_ROSTER_URL.replace("{id}", espnId));
          const athletes = roster.athletes || [];
          const flat = athletes.length && athletes[0].items ? athletes.flatMap((g: { items: unknown[] }) => g.items) : athletes;
          // deno-lint-ignore no-explicit-any
          const names = flat.map((p: any) => p.fullName as string);
          rosters.set(teamId, names);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          rosterErrors.push(`${t.team_name}: ${msg}`);
        }
      }),
    );
  }
  console.log(`Rosters fetched: ${rosters.size}/${P4_TEAMS.length}, errors: ${rosterErrors.length}`);

  // --- Reset, so departures show up as newly-absent rather than stale ---
  await supabase.from("players").update({ forecast_team_id: null }).not("player_id", "is", null);
  await supabase.from("player_stats").delete().eq("season", FORECAST_SEASON);

  const { data: existingPlayers } = await supabase.from("players").select("player_id, team_id").not("team_id", "is", null);
  const oldTeamByPlayer = new Map<string, string>();
  for (const r of existingPlayers ?? []) oldTeamByPlayer.set(r.player_id, r.team_id);

  // --- Match each roster to the historical pool ---
  let matchedTotal = 0;
  let unmatchedTotal = 0;
  let staleDeparturesSkipped = 0;
  const rosterByTeam = new Map<string, PoolStats[]>();
  const playerRows: Record<string, unknown>[] = [];
  const playerStatsRows: Record<string, unknown>[] = [];

  for (const [teamId, names] of rosters) {
    const roster: PoolStats[] = [];
    for (const name of names) {
      const stats = poolByName.get(normalizePlayerName(name));
      if (!stats) {
        unmatchedTotal++;
        continue;
      }
      const playerId = stats.player_id;

      const stintYear = trantridyear[playerId];
      if (stintYear && stintYear >= FORECAST_SEASON && oldTeamByPlayer.get(playerId) === teamId) {
        staleDeparturesSkipped++;
        continue;
      }

      matchedTotal++;
      roster.push(stats);
      playerRows.push({
        player_id: playerId,
        full_name: name,
        position: stats.position,
        class_year: stats.class_year,
        forecast_team_id: teamId,
        updated_at: new Date().toISOString(),
      });
      playerStatsRows.push({
        player_id: playerId,
        season: FORECAST_SEASON,
        ...Object.fromEntries(PLAYER_STAT_FIELDS.map((f) => [f, stats[f]])),
        updated_at: new Date().toISOString(),
      });
    }
    rosterByTeam.set(teamId, roster);
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
    `Roster matching: ${matchedTotal} matched, ${unmatchedTotal} unmatched, ` +
      `${staleDeparturesSkipped} dropped as stale departures`,
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
      {
        matchedTotal, unmatchedTotal, staleDeparturesSkipped, teamsProjected: teamRows.length,
        rostersFetched: rosters.size, rosterErrors: rosterErrors.slice(0, 10),
      },
      null,
      2,
    ),
    { headers: { "Content-Type": "application/json" } },
  );
}
