"""
Step 3: load scraper output into Supabase Postgres.

Reads scraper/output/team_stats.json and scraper/output/player_stats.json
(produced by scraper/scrape_all_p4.py) and upserts into the schema in
db/schema.sql, keyed as the spec intends: (team_id, season) and
(player_id, season) unique constraints mean re-running this for the same
day/season just overwrites in place — safe to run daily from the cron job.

team_id is a slug derived from Torvik's team_name (e.g. "N.C. State" ->
"n-c-state"). player_id uses Torvik's own internal numeric player id (from
getadvstats.php) rather than the spec draft's "firstname-lastname-team"
slug — a name+team slug breaks the moment a player transfers (new row
instead of an update), while Torvik's id is stable and already unique.

Requires DATABASE_URL env var (Supabase connection string, e.g. from
Project Settings > Database > Connection string > URI).
"""
import json
import os
import re
import sys
from pathlib import Path

import psycopg2
from dotenv import load_dotenv
from psycopg2.extras import execute_values

SCRAPER_OUTPUT = Path(__file__).parent.parent / "scraper" / "output"

load_dotenv(Path(__file__).parent / ".env")


def slugify(name: str) -> str:
    slug = name.lower()
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    return slug.strip("-")


def upsert_teams(cur, team_stats: list):
    teams_rows = [
        (slugify(t["team_name"]), t["team_name"], t["conference"])
        for t in team_stats
    ]
    execute_values(
        cur,
        """
        INSERT INTO teams (team_id, team_name, conference)
        VALUES %s
        ON CONFLICT (team_id) DO UPDATE SET
            team_name = EXCLUDED.team_name,
            conference = EXCLUDED.conference,
            updated_at = now()
        """,
        teams_rows,
    )

    stats_rows = [
        (
            slugify(t["team_name"]), t["season"], t["barthag"], t["adj_o"], t["adj_d"],
            t["adj_t"], t["efg_o"], t["efg_d"], t["tov_o"], t["tov_d"],
            t["oreb_o"], t["oreb_d"], t["ftr_o"], t["ftr_d"],
        )
        for t in team_stats
    ]
    execute_values(
        cur,
        """
        INSERT INTO team_stats
            (team_id, season, barthag, adj_o, adj_d, adj_t, efg_o, efg_d,
             tov_o, tov_d, oreb_o, oreb_d, ftr_o, ftr_d)
        VALUES %s
        ON CONFLICT (team_id, season) DO UPDATE SET
            barthag = EXCLUDED.barthag, adj_o = EXCLUDED.adj_o, adj_d = EXCLUDED.adj_d,
            adj_t = EXCLUDED.adj_t, efg_o = EXCLUDED.efg_o, efg_d = EXCLUDED.efg_d,
            tov_o = EXCLUDED.tov_o, tov_d = EXCLUDED.tov_d,
            oreb_o = EXCLUDED.oreb_o, oreb_d = EXCLUDED.oreb_d,
            ftr_o = EXCLUDED.ftr_o, ftr_d = EXCLUDED.ftr_d,
            updated_at = now()
        """,
        stats_rows,
    )


def upsert_players(cur, players: list):
    players_rows = [
        (
            str(p["player_id"]), p["full_name"], slugify(p["team_name"]),
            p.get("position"), p.get("class_year"),
        )
        for p in players
        if p.get("player_id") is not None
    ]
    execute_values(
        cur,
        """
        INSERT INTO players (player_id, full_name, team_id, position, class_year)
        VALUES %s
        ON CONFLICT (player_id) DO UPDATE SET
            full_name = EXCLUDED.full_name,
            team_id = EXCLUDED.team_id,
            position = EXCLUDED.position,
            class_year = EXCLUDED.class_year,
            updated_at = now()
        """,
        players_rows,
    )

    stats_rows = [
        (
            str(p["player_id"]), p["season"], p.get("minutes_pct"), p.get("ortg"),
            p.get("usg"), p.get("efg"), p.get("ts"), p.get("oreb_pct"),
            p.get("dreb_pct"), p.get("ast_pct"), p.get("tov_pct"),
            p.get("blk_pct"), p.get("stl_pct"), p.get("ftr"), p.get("pts_per_game"),
        )
        for p in players
        if p.get("player_id") is not None
    ]
    execute_values(
        cur,
        """
        INSERT INTO player_stats
            (player_id, season, minutes_pct, ortg, usg, efg, ts, oreb_pct,
             dreb_pct, ast_pct, tov_pct, blk_pct, stl_pct, ftr, pts_per_game)
        VALUES %s
        ON CONFLICT (player_id, season) DO UPDATE SET
            minutes_pct = EXCLUDED.minutes_pct, ortg = EXCLUDED.ortg, usg = EXCLUDED.usg,
            efg = EXCLUDED.efg, ts = EXCLUDED.ts, oreb_pct = EXCLUDED.oreb_pct,
            dreb_pct = EXCLUDED.dreb_pct, ast_pct = EXCLUDED.ast_pct,
            tov_pct = EXCLUDED.tov_pct, blk_pct = EXCLUDED.blk_pct,
            stl_pct = EXCLUDED.stl_pct, ftr = EXCLUDED.ftr,
            pts_per_game = EXCLUDED.pts_per_game, updated_at = now()
        """,
        stats_rows,
    )


def main():
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        print("ERROR: DATABASE_URL env var not set. See db/.env.example.", file=sys.stderr)
        sys.exit(1)

    team_stats = json.loads((SCRAPER_OUTPUT / "team_stats.json").read_text())
    players = json.loads((SCRAPER_OUTPUT / "player_stats.json").read_text())

    conn = psycopg2.connect(database_url)
    try:
        with conn.cursor() as cur:
            upsert_teams(cur, team_stats)
            upsert_players(cur, players)
        conn.commit()
        print(f"Upserted {len(team_stats)} teams and {len(players)} players.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
