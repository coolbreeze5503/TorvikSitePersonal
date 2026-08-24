"""
Builds a 2027 (2026-27 season) forecast, stored as season=2027 rows in the
same team_stats/player_stats tables, plus players.forecast_team_id. This is
NOT scraped data -- Barttorvik has no 2026-27 numbers yet (confirmed:
teamslicejson.php?year=2027 just redirects to trank.php, since no games
have been played). It's our own projection.

Correction from the first version of this script: that version assumed
players.team_id (kept "current" by the regular daily cron) already
reflected transfers, reasoning that Torvik's getadvstats.php must be
returning each player under their live roster team. That was wrong --
the daily cron always queries a FIXED 2025-26 date range
(start=20251101&end=20260501), so it only ever answers "who played for
this team during those specific games", which is a historical fact, not
a live roster signal. A transferred or graduated player's old team_id
just sits there unchanged regardless of what they do afterward. The
Kentucky roster spot-check that seemed to confirm the theory wasn't
actually testing it -- of course querying team=Kentucky for the 2025-26
window returns players who played for Kentucky in 2025-26.

Corrected approach, ground-truthed on ESPN's CURRENT roster per team
rather than Torvik's historical participation:

1. For each P4 team, fetch its current ESPN roster (real names, reflects
   today's actual roster -- transfers in, transfers out, graduations all
   already resolved by ESPN).
2. Fetch Torvik's full D1 player pool for 2025-26 in one call
   (getadvstats.php ...&page=all, not page=team&team=X -- this covers all
   365 D1 teams, not just our 68 P4 ones, which is what makes it possible
   to find a transfer's last-season stats even if they came from outside
   P4).
3. Match each roster name against the full pool by normalized name. A
   match gives real last-season per-possession stats to carry forward,
   regardless of which school (P4 or not) they were at last year.
4. A player who isn't on their old team's CURRENT roster anymore --
   graduated senior, transferred out, whatever -- is simply absent from
   every team's roster fetch this run, so they get no forecast. No need
   to special-case class_year == "Sr": roster absence handles it, and
   also correctly keeps a grad-transfer or extra-eligibility senior who
   IS still playing somewhere, since presence is what's checked, not
   class standing.

Known real gap, confirmed with actual 2026 transfer cases (Matt Able and
Musa Sagnia, N.C. State -> UNC/Virginia Tech; Mark Mitchell, Missouri ->
Kentucky): ESPN's roster feed is not fully synced for 2026-27 yet. It
correctly dropped Mitchell from Missouri but hadn't added him to
Kentucky; it hadn't dropped Able/Sagnia from N.C. State OR added them
to their new schools. Directly querying Torvik's own
getadvstats.php?year=2027&team=X was tested and doesn't help -- it
silently ignores the year and returns the same 2025-26 roster regardless
of what's requested.

One Torvik signal DOES help, partially: tridyeartransfers.json's first
dict maps trid (== player_id) to the year their current stint began.
Both Able and Sagnia already show 2027 there -- Torvik's own backend
knows they've moved on, even without game stats to prove it -- while
Mitchell still shows 2025, meaning Torvik hasn't picked up his move
either. Where this signal is present (stint year >= FORECAST_SEASON) and
ESPN is still listing the player on their OLD (2025-26) team, we drop
them from that team's forecast -- this fixes the "still shows up on
their old team" half of the bug. It doesn't fix the other half: we still
don't know Able's or Sagnia's actual destination if ESPN hasn't added
them anywhere yet, so they simply get no forecast at all until ESPN (or
some other source) catches up. Re-running this script periodically as
ESPN's data fills in over the following weeks is the practical remedy
for that half, short of adding a second live roster source.

players.team_id (the real 2025-26 team someone played for) is left alone
-- CURRENT_SEASON views must keep showing who actually played for whom
last season. The forecast roster lives in the separate
players.forecast_team_id column, populated fresh by this script each run
(reset to NULL first, so departures show up as newly-NULL rather than
stale).

Team-level and Barthag methodology are unchanged from the first version
(see git history / prior commit message): minutes-weighted average of
roster stats blended with last year's actual value by a coverage factor
for offense-side fields; defense-side fields and tempo carry forward
unchanged; Barthag derived via the fitted AdjO^11.5/(AdjO^11.5+AdjD^11.5)
formula.
"""
import json
import os
import re
import time
from pathlib import Path

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv
from playwright.sync_api import sync_playwright

from fetch_espn_media import (
    build_team_espn_map,
    normalize_player_name,
    slugify,
    fetch_json,
    ESPN_ROSTER_URL,
)

SCRAPER_DIR = Path(__file__).parent
load_dotenv(SCRAPER_DIR.parent / "db" / ".env")

FULL_POOL_URL = (
    "https://barttorvik.com/getadvstats.php"
    "?year=2026&specialSource=0&conyes=0&start=20251101&end=20260501"
    "&top=365&xvalue=All&page=all"
)
TRANSFERS_URL = "https://barttorvik.com/tridyeartransfers.json"

FORECAST_SEASON = 2027
BARTHAG_EXPONENT = 11.5
FULL_COVERAGE_MINUTES = 300.0

# Raw getadvstats.php array indices -- see scraper/scrape_all_p4.py for how
# each was originally verified against team.php's own rendered page/header.
PLAYER_FIELD_INDEX = {
    "gp": 3, "minutes_pct": 4, "ortg": 5, "usg": 6, "efg": 7, "ts": 8,
    "oreb_pct": 9, "dreb_pct": 10, "ast_pct": 11, "tov_pct": 12,
    "ftm": 13, "two_pm": 16, "three_pm": 19,
    "blk_pct": 22, "stl_pct": 23, "ftr": 24,
    "class_year": 25, "height": 26, "player_id": 32, "position": 64,
}

TEAM_TO_PLAYER_FIELD = {
    "adj_o": "ortg", "efg_o": "efg", "tov_o": "tov_pct",
    "oreb_o": "oreb_pct", "ftr_o": "ftr",
}
CARRY_FORWARD_TEAM_FIELDS = ["adj_d", "adj_t", "efg_d", "tov_d", "oreb_d", "ftr_d"]


def parse_pool_row(row):
    p = {f: row[idx] for f, idx in PLAYER_FIELD_INDEX.items()}
    gp = p["gp"] or 0
    if gp:
        total_pts = 2 * (p["two_pm"] or 0) + 3 * (p["three_pm"] or 0) + (p["ftm"] or 0)
        p["pts_per_game"] = round(total_pts / gp, 1)
    else:
        p["pts_per_game"] = None
    return p


def main():
    with open(SCRAPER_DIR / "p4_teams.json") as f:
        p4_teams = json.load(f)

    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    with sync_playwright() as p:
        rc = p.request.new_context(
            extra_http_headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"}
        )

        print("Building team -> ESPN id map...")
        team_espn_map = build_team_espn_map(rc, p4_teams)
        print(f"  {len(team_espn_map)}/{len(p4_teams)} teams resolved")

        print("Fetching full D1 player pool (2025-26)...")
        pool_raw = fetch_json(rc, FULL_POOL_URL)
        pool_by_name = {}
        dupes = 0
        for row in pool_raw:
            norm = normalize_player_name(row[0])
            if norm in pool_by_name:
                dupes += 1
                continue
            pool_by_name[norm] = parse_pool_row(row)
        print(f"  {len(pool_by_name)} distinct players ({dupes} duplicate-name collisions skipped)")

        print("Fetching Torvik's own transfer-year tracking...")
        transfers_raw = fetch_json(rc, TRANSFERS_URL)
        trantridyear = transfers_raw[0]  # trid (== player_id) -> year current stint began
        print(f"  {len(trantridyear)} tracked stints")

        print("Fetching current ESPN rosters...")
        rosters = {}  # team_id -> [full_name, ...]
        for i, t in enumerate(p4_teams):
            team_name = t["team_name"]
            team_id = slugify(team_name)
            espn = team_espn_map.get(team_name)
            if not espn:
                continue
            try:
                roster = fetch_json(rc, ESPN_ROSTER_URL.format(espn_id=espn["espn_id"]))
                athletes = roster.get("athletes", [])
                flat = (
                    [pl for group in athletes for pl in group["items"]]
                    if athletes and isinstance(athletes[0], dict) and "items" in athletes[0]
                    else athletes
                )
                rosters[team_id] = [pl["fullName"] for pl in flat]
                print(f"[{i+1}/{len(p4_teams)}] {team_name}: {len(flat)} on current roster")
            except Exception as e:
                print(f"[{i+1}/{len(p4_teams)}] {team_name}: roster fetch FAILED ({e})")
            time.sleep(0.3)

        rc.dispose()

    # --- Reset, so departures show up as newly-absent rather than stale ---
    cur.execute("UPDATE players SET forecast_team_id = NULL")
    cur.execute("DELETE FROM player_stats WHERE season = %s", (FORECAST_SEASON,))

    cur.execute("SELECT player_id, team_id FROM players WHERE team_id IS NOT NULL")
    old_team_by_player = {r["player_id"]: r["team_id"] for r in cur.fetchall()}

    # --- Match each roster to the historical pool, upsert players + player_stats ---
    matched_total = 0
    unmatched_total = 0
    stale_departures_skipped = 0
    roster_by_team = {}  # team_id -> [player_stats-shaped dict]

    for team_id, names in rosters.items():
        roster_by_team[team_id] = []
        for name in names:
            stats = pool_by_name.get(normalize_player_name(name))
            if not stats:
                unmatched_total += 1
                continue
            player_id = str(stats["player_id"])

            # Torvik's own transfer tracking says this player's active stint
            # moved on for the forecast season, but ESPN is still listing
            # them on their OLD team -- ESPN just hasn't caught up on the
            # departure yet. Skip here rather than show a stale roster spot;
            # we don't know their real destination, so they get no forecast
            # rather than a wrong one.
            stint_year = trantridyear.get(player_id)
            if stint_year and stint_year >= FORECAST_SEASON and old_team_by_player.get(player_id) == team_id:
                stale_departures_skipped += 1
                continue

            matched_total += 1

            cur.execute(
                """
                INSERT INTO players (player_id, full_name, position, class_year, forecast_team_id)
                VALUES (%(player_id)s, %(full_name)s, %(position)s, %(class_year)s, %(team_id)s)
                ON CONFLICT (player_id) DO UPDATE SET
                    forecast_team_id = EXCLUDED.forecast_team_id,
                    updated_at = now()
                """,
                {
                    "player_id": player_id,
                    "full_name": name,
                    "position": stats["position"],
                    "class_year": stats["class_year"],
                    "team_id": team_id,
                },
            )

            row = {"player_id": player_id, "season": FORECAST_SEASON, **{
                f: stats[f] for f in [
                    "minutes_pct", "ortg", "usg", "efg", "ts", "oreb_pct", "dreb_pct",
                    "ast_pct", "tov_pct", "blk_pct", "stl_pct", "ftr", "pts_per_game",
                ]
            }}
            roster_by_team[team_id].append(row)

    player_fields = ["minutes_pct", "ortg", "usg", "efg", "ts", "oreb_pct", "dreb_pct",
                      "ast_pct", "tov_pct", "blk_pct", "stl_pct", "ftr", "pts_per_game"]
    all_rows = [r for rows in roster_by_team.values() for r in rows]
    psycopg2.extras.execute_values(
        cur,
        f"""
        INSERT INTO player_stats (player_id, season, {", ".join(player_fields)})
        VALUES %s
        ON CONFLICT (player_id, season) DO UPDATE SET
            {", ".join(f"{f} = EXCLUDED.{f}" for f in player_fields)},
            updated_at = now()
        """,
        [(r["player_id"], r["season"], *[r[f] for f in player_fields]) for r in all_rows],
    )
    print(f"\nRoster matching: {matched_total} matched to prior-season stats, "
          f"{unmatched_total} unmatched (freshmen / no prior D1 data), "
          f"{stale_departures_skipped} dropped as stale departures (Torvik confirms moved on, "
          f"ESPN hadn't caught up)")

    # --- Team-level forecast, driven by the corrected roster ---
    cur.execute("SELECT * FROM team_stats WHERE season = 2026")
    last_year_team_stats = {r["team_id"]: r for r in cur.fetchall()}

    team_rows = []
    for team_id, roster in roster_by_team.items():
        last_year = last_year_team_stats.get(team_id)
        if not last_year:
            continue

        total_minutes = sum(float(r["minutes_pct"] or 0) for r in roster)
        coverage = min(1.0, total_minutes / FULL_COVERAGE_MINUTES) if roster else 0.0

        row = {"team_id": team_id, "season": FORECAST_SEASON}
        for team_field, player_field in TEAM_TO_PLAYER_FIELD.items():
            if roster and total_minutes > 0:
                weighted = sum(
                    float(r["minutes_pct"] or 0) * float(r[player_field] or 0) for r in roster
                ) / total_minutes
            else:
                weighted = float(last_year[team_field])
            baseline = float(last_year[team_field])
            row[team_field] = coverage * weighted + (1 - coverage) * baseline

        for field in CARRY_FORWARD_TEAM_FIELDS:
            row[field] = float(last_year[field])

        adj_o_k = float(row["adj_o"]) ** BARTHAG_EXPONENT
        adj_d_k = float(row["adj_d"]) ** BARTHAG_EXPONENT
        row["barthag"] = adj_o_k / (adj_o_k + adj_d_k)

        team_rows.append(row)

    team_field_order = ["adj_o", "adj_d", "adj_t", "efg_o", "efg_d", "tov_o",
                         "tov_d", "oreb_o", "oreb_d", "ftr_o", "ftr_d", "barthag"]
    psycopg2.extras.execute_values(
        cur,
        f"""
        INSERT INTO team_stats (team_id, season, {", ".join(team_field_order)})
        VALUES %s
        ON CONFLICT (team_id, season) DO UPDATE SET
            {", ".join(f"{f} = EXCLUDED.{f}" for f in team_field_order)},
            updated_at = now()
        """,
        [(r["team_id"], r["season"], *[r[f] for f in team_field_order]) for r in team_rows],
    )
    print(f"Team forecasts: {len(team_rows)} teams projected forward")

    conn.commit()
    conn.close()


if __name__ == "__main__":
    main()
