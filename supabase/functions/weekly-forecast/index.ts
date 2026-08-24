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
// A transfer arriving from a school outside our own (P4-only) players table
// still needs prior-season stats from somewhere. For a G5/mid-major
// transfer those stats genuinely exist -- Torvik tracks the full D1 pool
// (~4,900 players, all 365 schools), we just never fetched the non-P4
// slice of it -- so this falls back to that pool (getadvstats.php,
// page=all) for any matched slug not already in our own players table, and
// inserts them as a new row (team_id left null: we don't track their old,
// non-P4 team, only where they're forecast to play now).
//
// A true freshman or international signee has no US college stats
// anywhere, in our table or Torvik's D1 pool -- there's no real data to
// carry forward for them, full stop. What we do instead: assign them the
// average SOURCE_SEASON stat line of real P4 players who share their class
// year and (when we can tell it from the roster page) position bucket,
// stored with is_projected=true so the site can label it as an estimate
// rather than a real number. This is a v1 baseline only -- it can't tell a
// five-star recruit from a walk-on. A recruiting-rank modifier (247/On3/
// Rivals star rating) is the planned v2, once this baseline is confirmed
// working.

const POOL_PLAYER_FIELD_INDEX: Record<string, number> = {
  gp: 3, minutes_pct: 4, ortg: 5, usg: 6, efg: 7, ts: 8,
  oreb_pct: 9, dreb_pct: 10, ast_pct: 11, tov_pct: 12,
  ftm: 13, two_pm: 16, three_pm: 19, blk_pct: 22, stl_pct: 23,
  ftr: 24, class_year: 25, player_id: 32, position: 64,
};

// Buckets Torvik's finer position labels (as stored in our own players
// table) down to G/F/C, the granularity a roster page's own text can
// realistically be parsed back into for a projected player.
const POSITION_BUCKET: Record<string, "G" | "F" | "C"> = {
  "Wing G": "G", "Combo G": "G", "Scoring PG": "G", "Pure PG": "G",
  "Wing F": "F", "Stretch 4": "F",
  "C": "C", "PF/C": "C",
};

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

function slugToDisplayName(slug: string): string {
  return slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function looksLikeNameSlug(seg: string): boolean {
  if (!/^[a-z][a-z0-9]*(-[a-z0-9]+){1,5}$/.test(seg)) return false;
  if (EXCLUDE_SEGMENTS.has(seg)) return false;
  if (/^\d{4}-\d{2}$/.test(seg)) return false;
  if (/^[a-z]-[a-z]+$/.test(seg) && seg.length < 8) return false; // sport codes like "m-baskbl"
  return true;
}

interface SlugMeta {
  classYear: string | null;
  position: "G" | "F" | "C" | null;
}

const CLASS_YEAR_RE = /\b(Freshman|Sophomore|Junior|Senior|Graduate|Fr\.?|So\.?|Jr\.?|Sr\.?|Gr\.?)\b/;
const POSITION_WORD_RE = /\b(Guard|Forward|Center)\b/i;
const POSITION_ABBR_RE = />(G\/F|F\/C|G|F|C)</;

function normalizeClassYear(raw: string): string | null {
  const s = raw.toLowerCase();
  if (s.startsWith("fr") || s === "freshman") return "Fr";
  if (s.startsWith("so") || s === "sophomore") return "So";
  if (s.startsWith("jr") || s === "junior") return "Jr";
  if (s.startsWith("sr") || s === "senior") return "Sr";
  if (s.startsWith("gr") || s === "graduate") return "Gr";
  return null;
}

// Best-effort: look at the text right after a player's roster-page link for
// a class year / position hint, so an unmatched (no-stats-anywhere) player
// can still be bucketed for the projection baseline below. Template text
// varies too much across 68 sites to do more than this -- when neither
// pattern is found, the caller falls back to a coarser baseline tier.
function extractMetaNear(html: string, matchIndex: number, nextMatchIndex: number): SlugMeta {
  const window = html.slice(matchIndex, Math.min(nextMatchIndex, matchIndex + 600));
  const cyMatch = window.match(CLASS_YEAR_RE);
  const classYear = cyMatch ? normalizeClassYear(cyMatch[1]) : null;

  let position: "G" | "F" | "C" | null = null;
  const posWordMatch = window.match(POSITION_WORD_RE);
  if (posWordMatch) {
    const w = posWordMatch[1].toLowerCase();
    position = w === "guard" ? "G" : w === "forward" ? "F" : "C";
  } else {
    const posAbbrMatch = window.match(POSITION_ABBR_RE);
    if (posAbbrMatch) {
      const a = posAbbrMatch[1];
      position = a.includes("G") ? "G" : a.includes("C") ? "C" : "F";
    }
  }
  return { classYear, position };
}

function extractSlugsWithMeta(html: string): Map<string, SlugMeta> {
  const result = new Map<string, SlugMeta>();
  const matches = [...html.matchAll(HREF_RE)];
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
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
      if (looksLikeNameSlug(seg) && !result.has(seg)) {
        const nextIndex = matches[i + 1]?.index ?? html.length;
        result.set(seg, extractMetaNear(html, match.index!, nextIndex));
      }
    }
  }
  return result;
}

async function fetchRosterSlugs(url: string): Promise<Map<string, SlugMeta>> {
  try {
    const resp = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (resp.status !== 200) return new Map();
    const html = await resp.text();
    return extractSlugsWithMeta(html);
  } catch {
    return new Map();
  }
}

interface ResolvedPlayer {
  player_id: string;
  full_name: string;
  position: string | null;
  class_year: string | null;
  stats: Record<string, unknown>;
  isProjected?: boolean;
}

// Full D1 pool (all 365 schools), used only as a fallback for slugs that
// don't match anyone already in our own (P4-only) players table.
async function fetchD1PoolByNormalizedName(): Promise<Map<string, ResolvedPlayer>> {
  const byName = new Map<string, ResolvedPlayer>();
  try {
    const resp = await fetch(
      `https://barttorvik.com/getadvstats.php?year=${SOURCE_SEASON}&page=all`,
      { headers: { "User-Agent": USER_AGENT } },
    );
    if (resp.status !== 200) return byName;
    const rows: unknown[][] = await resp.json();
    for (const row of rows) {
      const fullName = row[0] as string;
      const p: Record<string, unknown> = {};
      for (const [field, idx] of Object.entries(POOL_PLAYER_FIELD_INDEX)) p[field] = row[idx];
      if (p.player_id == null || !fullName) continue;

      const gp = Number(p.gp) || 0;
      const totalPts = 2 * (Number(p.two_pm) || 0) + 3 * (Number(p.three_pm) || 0) + (Number(p.ftm) || 0);
      const stats: Record<string, unknown> = { pts_per_game: gp ? Math.round((totalPts / gp) * 10) / 10 : null };
      for (const f of PLAYER_STAT_FIELDS) if (f !== "pts_per_game") stats[f] = p[f];

      const key = normalizeKey(fullName);
      if (!byName.has(key)) {
        byName.set(key, {
          player_id: String(p.player_id),
          full_name: fullName,
          position: (p.position as string) ?? null,
          class_year: (p.class_year as string) ?? null,
          stats,
        });
      }
    }
  } catch {
    // no fallback data this run -- non-DB slugs just stay unmatched
  }
  return byName;
}

interface ProjectionBaseline {
  byPositionClass: Map<string, Record<string, number>>; // key: "G|Fr" etc, from real P4 players
  byClass: Map<string, Record<string, number>>; // key: "Fr" etc, all positions pooled
  overall: Record<string, number>;
}

const MIN_BASELINE_SAMPLES = 5;

function averageStats(rows: Record<string, unknown>[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of PLAYER_STAT_FIELDS) {
    const vals = rows.map((r) => Number(r[f])).filter((v) => Number.isFinite(v));
    out[f] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  }
  return out;
}

// Builds the v1 projection baseline entirely from real P4 players already
// loaded from our own DB -- no new data source. A player with no real
// stats anywhere gets the average stat line of real players who share
// their class year and (if the roster page's text gave us one) position
// bucket, falling back to a class-year-only average when the position-
// specific bucket is too thin to trust, and to the overall average when
// even class year is unknown.
function buildProjectionBaseline(
  players: { position: string | null; class_year: string | null; player_stats: unknown }[],
): ProjectionBaseline {
  const byPositionClassRows = new Map<string, Record<string, unknown>[]>();
  const byClassRows = new Map<string, Record<string, unknown>[]>();
  const overallRows: Record<string, unknown>[] = [];

  for (const p of players) {
    const statsRows = Array.isArray(p.player_stats) ? p.player_stats : p.player_stats ? [p.player_stats] : [];
    const stats = (statsRows as { season: number }[]).find((s) => s.season === SOURCE_SEASON);
    if (!stats) continue;

    overallRows.push(stats as Record<string, unknown>);
    if (p.class_year) {
      if (!byClassRows.has(p.class_year)) byClassRows.set(p.class_year, []);
      byClassRows.get(p.class_year)!.push(stats as Record<string, unknown>);
    }
    const posBucket = p.position ? POSITION_BUCKET[p.position] : undefined;
    if (posBucket && p.class_year) {
      const key = `${posBucket}|${p.class_year}`;
      if (!byPositionClassRows.has(key)) byPositionClassRows.set(key, []);
      byPositionClassRows.get(key)!.push(stats as Record<string, unknown>);
    }
  }

  const byPositionClass = new Map<string, Record<string, number>>();
  for (const [key, rows] of byPositionClassRows) {
    if (rows.length >= MIN_BASELINE_SAMPLES) byPositionClass.set(key, averageStats(rows));
  }
  const byClass = new Map<string, Record<string, number>>();
  for (const [key, rows] of byClassRows) byClass.set(key, averageStats(rows));

  return { byPositionClass, byClass, overall: averageStats(overallRows) };
}

function projectStats(
  baseline: ProjectionBaseline,
  classYear: string | null,
  position: "G" | "F" | "C" | null,
): Record<string, number> {
  // Most genuinely-unmatched players are incoming true freshmen (the other
  // realistic case, an international signee, also usually enters as
  // first-year eligible) -- "Fr" is the safest default when the roster
  // page's text didn't yield a class year.
  const cy = classYear ?? "Fr";
  if (position) {
    const hit = baseline.byPositionClass.get(`${position}|${cy}`);
    if (hit) return hit;
  }
  return baseline.byClass.get(cy) ?? baseline.overall;
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

  const baseline = buildProjectionBaseline(allPlayers ?? []);
  console.log(
    `Projection baseline: ${baseline.byPositionClass.size} position+class buckets, ` +
      `${baseline.byClass.size} class-year-only buckets`,
  );

  console.log("Fetching Torvik's full D1 pool as a fallback for non-P4 transfers...");
  const poolPromise = fetchD1PoolByNormalizedName();

  console.log(`Scraping ${Object.keys(ROSTER_URLS).length} team roster pages...`);
  const teamIds = Object.keys(ROSTER_URLS) as (keyof typeof ROSTER_URLS)[];
  const BATCH_SIZE = 10;
  const slugsByTeam = new Map<string, Map<string, SlugMeta>>();
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

  const poolByNormalizedName = await poolPromise;
  console.log(`D1 pool fallback: ${poolByNormalizedName.size} players available`);

  function hasSourceSeasonStats(playerStats: unknown): boolean {
    const rows = Array.isArray(playerStats) ? playerStats : playerStats ? [playerStats] : [];
    return (rows as { season: number }[]).some((s) => s.season === SOURCE_SEASON);
  }

  // New forecast_team_id assignment, built only from successfully-scraped teams.
  const newAssignment = new Map<string, string>(); // player_id -> team_id
  // player_id -> pool/projection data, for anyone whose stats for this run
  // aren't a plain "already had real SOURCE_SEASON stats in our DB" case --
  // covers both real D1-pool transfers and projected freshmen/internationals,
  // including a *previously* projected player who's now found by name in our
  // own DB (their own upsert from an earlier run) but still has no real
  // SOURCE_SEASON stats to show for it -- they need a fresh projection again,
  // not to be silently dropped by a stats lookup that will never succeed.
  const poolMatches = new Map<string, ResolvedPlayer>();
  let matchedFromDb = 0;
  let matchedFromPool = 0;
  let matchedFromProjection = 0;
  for (const [teamId, slugs] of slugsByTeam) {
    if (!successfulTeams.has(teamId)) continue;
    for (const [slug, meta] of slugs) {
      const key = normalizeKey(slug);
      const dbPlayer = byNormalizedName.get(key);
      if (dbPlayer && hasSourceSeasonStats(dbPlayer.player_stats)) {
        newAssignment.set(dbPlayer.player_id, teamId);
        matchedFromDb++;
        continue;
      }
      const poolPlayer = poolByNormalizedName.get(key);
      if (poolPlayer) {
        // Prefer the dbPlayer's own id when one already exists (e.g. a
        // former projection placeholder now discoverable in the full D1
        // pool) so this doesn't create a second row for the same person.
        const id = dbPlayer?.player_id ?? poolPlayer.player_id;
        newAssignment.set(id, teamId);
        poolMatches.set(id, { ...poolPlayer, player_id: id });
        matchedFromPool++;
        continue;
      }
      // No real stats anywhere -- true freshman or international signee.
      // Reuse the existing dbPlayer id if this same person was already
      // projected in an earlier run, otherwise mint a stable synthetic one
      // (scoped by team so the same slug on two different rosters can't
      // collide).
      const projectedId = dbPlayer?.player_id ?? `proj-${teamId}-${slug}`;
      const classYear = meta.classYear ?? dbPlayer?.class_year ?? null;
      const posBucket = meta.position ?? (dbPlayer?.position ? POSITION_BUCKET[dbPlayer.position] ?? null : null);
      newAssignment.set(projectedId, teamId);
      poolMatches.set(projectedId, {
        player_id: projectedId,
        full_name: dbPlayer?.full_name ?? slugToDisplayName(slug),
        position: dbPlayer?.position ?? posBucket,
        class_year: classYear,
        stats: projectStats(baseline, classYear, posBucket),
        isProjected: true,
      });
      matchedFromProjection++;
    }
  }
  console.log(
    `Matched ${matchedFromDb} slugs from our own DB, ${matchedFromPool} from Torvik's full D1 pool (non-P4 transfers), ` +
      `${matchedFromProjection} from the projection baseline (no real stats anywhere -- freshman/international)`,
  );

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
    const dbPlayer = (allPlayers ?? []).find((p) => p.player_id === playerId);
    const poolPlayer = poolMatches.get(playerId);

    let full_name: string;
    let position: string | null;
    let class_year: string | null;
    let stats: Record<string, unknown> | undefined;

    // poolPlayer (real D1-pool transfer stats, or a fresh projection) takes
    // priority: it's only ever set when the matching loop above decided
    // dbPlayer's own SOURCE_SEASON stats (if any) can't be used this run.
    if (poolPlayer) {
      full_name = poolPlayer.full_name;
      position = poolPlayer.position;
      class_year = poolPlayer.class_year;
      stats = poolPlayer.stats;
    } else if (dbPlayer) {
      full_name = dbPlayer.full_name;
      position = dbPlayer.position;
      class_year = dbPlayer.class_year;
      const statsRows = Array.isArray(dbPlayer.player_stats)
        ? dbPlayer.player_stats
        : dbPlayer.player_stats
        ? [dbPlayer.player_stats]
        : [];
      stats = statsRows.find((s: { season: number }) => s.season === SOURCE_SEASON);
    } else {
      continue;
    }
    if (!stats) continue; // matched a player we've never recorded a season for -- can't forecast

    playerRows.push({
      player_id: playerId,
      full_name,
      position,
      class_year,
      // A pool-fallback player's actual (non-P4) team isn't one we track,
      // so team_id stays null for them -- only forecast_team_id is known.
      ...(dbPlayer ? {} : { team_id: null }),
      forecast_team_id: teamId,
      updated_at: new Date().toISOString(),
    });
    const statsRow = {
      player_id: playerId,
      season: FORECAST_SEASON,
      ...Object.fromEntries(PLAYER_STAT_FIELDS.map((f) => [f, (stats as Record<string, unknown>)[f]])),
      is_projected: poolPlayer?.isProjected ?? false,
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
      const lastYearValue = Number(lastYear[teamField]);
      const weighted =
        roster.length && totalMinutes > 0
          ? roster.reduce((sum, r) => sum + (Number(r.minutes_pct) || 0) * Number(r[playerField] || 0), 0) / totalMinutes
          : lastYearValue;
      row[teamField] = coverage * weighted + (1 - coverage) * lastYearValue;
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
        slugsMatchedFromDb: matchedFromDb,
        slugsMatchedFromPool: matchedFromPool,
        slugsMatchedFromProjection: matchedFromProjection,
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
