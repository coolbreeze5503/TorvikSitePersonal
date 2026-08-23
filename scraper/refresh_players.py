"""
One-off patch: re-fetch only getadvstats.php (not teamslicejson.php, which
hasn't changed) to pick up the "position" field added to PLAYER_FIELD_INDEX
after the initial full scrape. Reuses scrape_all_p4's fetch/parse functions.
"""
import json
import random
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

from scrape_all_p4 import (
    USER_AGENT, PLAYER_URL, fetch_json, parse_players, SCRAPER_DIR,
)

with open(SCRAPER_DIR / "p4_teams.json") as f:
    teams = json.load(f)

all_players = []
errors = []

with sync_playwright() as p:
    rc = p.request.new_context(extra_http_headers={"User-Agent": USER_AGENT})
    for i, t in enumerate(teams):
        team_name = t["team_name"]
        encoded = team_name.replace(" ", "%20").replace("&", "%26")
        try:
            raw = fetch_json(
                rc,
                PLAYER_URL.format(year=2026, start="20251101", end="20260501", team=encoded),
            )
            players = parse_players(raw, team_name, 2026)
            all_players.extend(players)
            print(f"[{i+1}/{len(teams)}] {team_name}: OK ({len(players)} players)")
        except Exception as e:
            print(f"[{i+1}/{len(teams)}] {team_name}: FAILED ({e})")
            errors.append({"team": team_name, "error": str(e)})
        time.sleep(random.uniform(1.5, 3.0))
    rc.dispose()

out_path = SCRAPER_DIR / "output" / "player_stats.json"
out_path.write_text(json.dumps(all_players, indent=2))
print(f"\nPlayers: {len(all_players)}, Errors: {len(errors)}")
print(f"Saved to {out_path}")
