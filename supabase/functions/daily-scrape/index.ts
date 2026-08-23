// Daily P4 scrape, ported from scraper/scrape_all_p4.py.
//
// Runs as a Supabase Edge Function (Deno) instead of GitHub Actions: GH-hosted
// runner IPs got an immediate 403 from barttorvik's CDN on the very first
// request (see commit history / conversation for the diagnosis), which
// pointed at shared cloud/CI IP reputation blocking rather than a request-
// volume rate limit. This never needed a real browser — barttorvik's
// team.php is backed by plain JSON endpoints with no Cloudflare/bot
// challenge — so a lightweight fetch()-based function is a straight port,
// not a rewrite of the actual scraping logic.
//
// Field index maps are unchanged from the Python version, reverse-engineered
// from team.php's inline JS (targetdata[N]) and its player-table header
// markup (<th class="N">) — see scraper/scrape_team.py and
// scraper/scrape_all_p4.py for how each index was verified.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const YEAR = 2026;
const SEASON_START = "20251101";
const SEASON_END = "20260501";

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

// Matches db/schema.sql's team_stats columns exactly (a subset of the full
// index map used in scraper/scrape_all_p4.py's JSON output).
const TEAM_FIELD_INDEX: Record<string, number> = {
  efg_o: 0, efg_d: 1, ftr_o: 2, ftr_d: 3, tov_o: 4, tov_d: 5,
  oreb_o: 6, oreb_d: 7, adj_t: 19, adj_o: 20, adj_d: 21, barthag: 61,
};

const PLAYER_FIELD_INDEX: Record<string, number> = {
  gp: 3, minutes_pct: 4, ortg: 5, usg: 6, efg: 7, ts: 8,
  oreb_pct: 9, dreb_pct: 10, ast_pct: 11, tov_pct: 12,
  ftm: 13, fta: 14, ft_pct: 15, two_pm: 16, two_pa: 17, two_pct: 18,
  three_pm: 19, three_pa: 20, three_pct: 21, blk_pct: 22, stl_pct: 23,
  ftr: 24, class_year: 25, height: 26, player_id: 32, position: 64,
};

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url: string, maxRetries = 2, backoffMs = 10000): Promise<any> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const resp = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (resp.status === 200) return await resp.json();
    if (resp.status === 403 && attempt < maxRetries) {
      const wait = backoffMs * (attempt + 1);
      console.log(`  -> 403 (rate limited), backing off ${wait}ms (attempt ${attempt + 1}/${maxRetries})...`);
      await sleep(wait);
      continue;
    }
    throw new Error(`Unexpected status ${resp.status} for ${url}`);
  }
}

function parseTeamStats(raw: any[], teamName: string) {
  const stats: Record<string, unknown> = {
    team_id: slugify(teamName),
    season: YEAR,
  };
  for (const [field, idx] of Object.entries(TEAM_FIELD_INDEX)) {
    stats[field] = raw[idx];
  }
  return stats;
}

function parsePlayers(rawRows: any[][], teamName: string) {
  return rawRows.map((row) => {
    const p: Record<string, unknown> = {
      full_name: row[0],
      team_id: slugify(teamName),
      season: YEAR,
    };
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
    return p;
  });
}

Deno.serve(async (_req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const results = { teamsOk: 0, playersOk: 0, errors: [] as { team: string; error: string }[] };

  for (const t of P4_TEAMS) {
    const encoded = encodeURIComponent(t.team_name);
    try {
      const teamRaw = await fetchJson(
        `https://barttorvik.com/teamslicejson.php?year=${YEAR}&top=365&venue=All&fteam=${encoded}&adjall=0&split=0`,
      );
      const teamStats = parseTeamStats(teamRaw, t.team_name);

      const { error: teamErr } = await supabase
        .from("teams")
        .upsert(
          { team_id: teamStats.team_id, team_name: t.team_name, conference: t.conference, updated_at: new Date().toISOString() },
          { onConflict: "team_id" },
        );
      if (teamErr) throw teamErr;

      const { error: statsErr } = await supabase
        .from("team_stats")
        .upsert(
          { ...teamStats, updated_at: new Date().toISOString() },
          { onConflict: "team_id,season" },
        );
      if (statsErr) throw statsErr;

      await sleep(300);

      const playerRaw = await fetchJson(
        `https://barttorvik.com/getadvstats.php?year=${YEAR}&specialSource=0&conyes=0&start=${SEASON_START}&end=${SEASON_END}&top=365&xvalue=All&page=team&team=${encoded}`,
      );
      const players = parsePlayers(playerRaw, t.team_name);

      const playersRows = players
        .filter((p) => p.player_id != null)
        .map((p) => ({
          player_id: String(p.player_id),
          full_name: p.full_name,
          team_id: p.team_id,
          position: p.position,
          class_year: p.class_year,
          updated_at: new Date().toISOString(),
        }));
      const { error: playersErr } = await supabase
        .from("players")
        .upsert(playersRows, { onConflict: "player_id" });
      if (playersErr) throw playersErr;

      const playerStatsRows = players
        .filter((p) => p.player_id != null)
        .map((p) => ({
          player_id: String(p.player_id),
          season: p.season,
          minutes_pct: p.minutes_pct,
          ortg: p.ortg,
          usg: p.usg,
          efg: p.efg,
          ts: p.ts,
          oreb_pct: p.oreb_pct,
          dreb_pct: p.dreb_pct,
          ast_pct: p.ast_pct,
          tov_pct: p.tov_pct,
          blk_pct: p.blk_pct,
          stl_pct: p.stl_pct,
          ftr: p.ftr,
          pts_per_game: p.pts_per_game,
          updated_at: new Date().toISOString(),
        }));
      const { error: playerStatsErr } = await supabase
        .from("player_stats")
        .upsert(playerStatsRows, { onConflict: "player_id,season" });
      if (playerStatsErr) throw playerStatsErr;

      results.teamsOk += 1;
      results.playersOk += playersRows.length;
      console.log(`${t.team_name}: OK (${playersRows.length} players)`);
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : JSON.stringify(e);
      console.log(`${t.team_name}: FAILED (${errMsg})`);
      results.errors.push({ team: t.team_name, error: errMsg });
    }

    await sleep(300);
  }

  return new Response(JSON.stringify(results, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
});
