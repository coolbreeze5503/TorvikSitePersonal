"""
Builds a 2027 (2026-27 season) forecast, stored as season=2027 rows in the
same team_stats/player_stats tables. This is NOT scraped data -- Barttorvik
has no 2026-27 data yet (confirmed: teamslicejson.php?year=2027 just
redirects to trank.php, since no games have been played). It's our own
projection, built entirely from data already in the DB:

- players.team_id is kept current by the existing daily cron (Torvik's own
  getadvstats.php returns each player under their CURRENT roster team, not
  last season's team -- confirmed empirically: Kentucky's live ESPN roster
  cross-referenced against our DB already shows every returning/transferred
  player tagged to team_id='kentucky'). So "adjusted for who transferred
  where" falls out for free: a transfer's last-season stats are already
  attached to their new team_id.
- Players with no season=2026 row (true freshmen, or transfers from outside
  our P4-only dataset) get NO 2027 forecast -- there's no honest basis for
  one, and the frontend shows "no forecast data" rather than inventing a
  number.

Methodology (deliberately simple and stated plainly, not presented as a
rigorous model):

Player-level: carry forward each returning/transferred player's season=2026
rate stats (efg, ts, usg, oreb_pct, dreb_pct, ast_pct, tov_pct, blk_pct,
stl_pct, ftr, ortg, minutes_pct, pts_per_game) UNCHANGED under their current
team_id. "If they perform like they did last year."

Team-level: offense-side fields (adj_o, efg_o, tov_o, oreb_o, ftr_o) use a
minutes_pct-weighted average of returning/transferred players' matching
rate stat, blended with last year's actual team value by a "coverage"
factor (how much of a full rotation's worth of minutes is accounted for by
matched players) -- teams that return/add a full rotation lean on the
player-level estimate; teams with heavy turnover lean back toward last
year's number rather than extrapolating from a thin sample.

Defense-side fields (adj_d, efg_d, tov_d, oreb_d, ftr_d) and adj_t (tempo)
carry forward unchanged from 2026 -- there's no individual defensive-
efficiency stat in our schema to build a player-weighted defensive
estimate from, so this is a flat continuity assumption, not a projection.

barthag_2027 is derived from adj_o_2027/adj_d_2027 via the fitted formula
(exponent 11.5, matches Torvik's actual formula almost exactly -- fit
against our own 68 real 2026 team rows, mean abs error 0.0004).
"""
import os
from pathlib import Path

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / "db" / ".env")

SOURCE_SEASON = 2026
FORECAST_SEASON = 2027
BARTHAG_EXPONENT = 11.5

PLAYER_RATE_FIELDS = [
    "minutes_pct", "ortg", "usg", "efg", "ts", "oreb_pct", "dreb_pct",
    "ast_pct", "tov_pct", "blk_pct", "stl_pct", "ftr", "pts_per_game",
]

# team_stats field -> matching player_stats field, for the offense-side
# weighted-average projection.
TEAM_TO_PLAYER_FIELD = {
    "adj_o": "ortg",
    "efg_o": "efg",
    "tov_o": "tov_pct",
    "oreb_o": "oreb_pct",
    "ftr_o": "ftr",
}
CARRY_FORWARD_FIELDS = ["adj_d", "adj_t", "efg_d", "tov_d", "oreb_d", "ftr_d"]

# Minutes_pct sum treated as "full confidence" -- roughly a 3-player core
# rotation's worth of returning production.
FULL_COVERAGE_MINUTES = 300.0


def main():
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    cur.execute("SELECT player_id, team_id FROM players")
    current_team_by_player = {r["player_id"]: r["team_id"] for r in cur.fetchall()}

    cur.execute(
        "SELECT * FROM player_stats WHERE season = %s", (SOURCE_SEASON,)
    )
    stats_by_player = {r["player_id"]: r for r in cur.fetchall()}

    cur.execute(
        "SELECT * FROM team_stats WHERE season = %s", (SOURCE_SEASON,)
    )
    last_year_team_stats = {r["team_id"]: r for r in cur.fetchall()}

    cur.execute("SELECT team_id FROM teams")
    all_team_ids = [r["team_id"] for r in cur.fetchall()]

    # --- Player-level forecast: carry forward rate stats under current team ---
    player_rows = []
    roster_by_team = {tid: [] for tid in all_team_ids}
    for player_id, team_id in current_team_by_player.items():
        src = stats_by_player.get(player_id)
        if not src:
            continue
        row = {"player_id": player_id, "season": FORECAST_SEASON}
        for f in PLAYER_RATE_FIELDS:
            row[f] = src[f]
        player_rows.append(row)
        if team_id in roster_by_team:
            roster_by_team[team_id].append(row)

    psycopg2.extras.execute_values(
        cur,
        f"""
        INSERT INTO player_stats
            (player_id, season, {", ".join(PLAYER_RATE_FIELDS)})
        VALUES %s
        ON CONFLICT (player_id, season) DO UPDATE SET
            {", ".join(f"{f} = EXCLUDED.{f}" for f in PLAYER_RATE_FIELDS)},
            updated_at = now()
        """,
        [
            (r["player_id"], r["season"], *[r[f] for f in PLAYER_RATE_FIELDS])
            for r in player_rows
        ],
    )
    print(f"Player forecasts: {len(player_rows)} players projected forward")

    # --- Team-level forecast ---
    team_rows = []
    for team_id in all_team_ids:
        last_year = last_year_team_stats.get(team_id)
        if not last_year:
            continue

        roster = roster_by_team.get(team_id, [])
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

        for field in CARRY_FORWARD_FIELDS:
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
        INSERT INTO team_stats
            (team_id, season, {", ".join(team_field_order)})
        VALUES %s
        ON CONFLICT (team_id, season) DO UPDATE SET
            {", ".join(f"{f} = EXCLUDED.{f}" for f in team_field_order)},
            updated_at = now()
        """,
        [
            (r["team_id"], r["season"], *[r[f] for f in team_field_order])
            for r in team_rows
        ],
    )
    print(f"Team forecasts: {len(team_rows)} teams projected forward")

    conn.commit()
    conn.close()


if __name__ == "__main__":
    main()
