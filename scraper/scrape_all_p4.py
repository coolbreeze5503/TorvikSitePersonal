"""
Step 2 of build order: extend scraper to all P4 teams + player stats.

Team list source: teamstats.php?year=2026 — parsed once into p4_teams.json
(team.php URL name + conf.php conference code for every ACC/B10/B12/SEC team).
Regenerate that file if conference realignment happens.

Team stats: teamslicejson.php (see scrape_team.py for the index map + how it
was derived from team.php's inline JS).

Player stats: getadvstats.php?page=team&team={team} — one JSON array per
player. Field indices were NOT guessed from playerstat.js variable names
(those turned out to be misleading — e.g. its "ppg" is actually index 28,
which is PRPG! (Adjusted PORPAGATU, a value-over-replacement metric), not
points per game). Instead they were read directly off team.php's own player
table header markup, which encodes each column's array index in its
`class="N"` attribute (e.g. <th class="7" id="efg">eFG</th> -> index 7).
Cross-checked against Isaiah Evans's actual box score: computed 15.0 PPG
from (2*2PM + 3*3PM + FTM) / GP, a realistic total for Duke's leading scorer.
"""
import json
import random
import sys
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

SCRAPER_DIR = Path(__file__).parent
TEAMSLICE_URL = (
    "https://barttorvik.com/teamslicejson.php"
    "?year={year}&top=365&venue=All&fteam={team}&adjall=0&split=0"
)
PLAYER_URL = (
    "https://barttorvik.com/getadvstats.php"
    "?year={year}&specialSource=0&conyes=0&start={start}&end={end}"
    "&top=365&xvalue=All&page=team&team={team}"
)

TEAM_FIELD_INDEX = {
    "efg_o": 0, "efg_d": 1, "ftr_o": 2, "ftr_d": 3, "tov_o": 4, "tov_d": 5,
    "oreb_o": 6, "oreb_d": 7,  # oreb_d = opponent OREB% allowed, LOWER is better
    "two_per_o": 9, "two_per_d": 10, "three_per_o": 11, "three_per_d": 12,
    "ft_per_o": 13, "ft_per_d": 14, "three_rate_o": 15, "three_rate_d": 16,
    "assist_rate_o": 17, "assist_rate_d": 18, "adj_t": 19, "adj_o": 20,
    "adj_d": 21, "barthag_rk": 44, "record": 46, "num_games": 47,
    "pool_size": 48, "barthag": 61, "blk_per_o": 62, "blk_per_d": 63,
}

# Verified against team.php's player-table header `class="N"` attributes.
PLAYER_FIELD_INDEX = {
    "gp": 3, "minutes_pct": 4, "ortg": 5, "usg": 6, "efg": 7, "ts": 8,
    "oreb_pct": 9, "dreb_pct": 10, "ast_pct": 11, "tov_pct": 12,
    "ftm": 13, "fta": 14, "ft_pct": 15,
    "two_pm": 16, "two_pa": 17, "two_pct": 18,
    "three_pm": 19, "three_pa": 20, "three_pct": 21,
    "blk_pct": 22, "stl_pct": 23, "ftr": 24,
    "class_year": 25, "height": 26, "player_id": 32, "position": 64,
}


def fetch_json(request_context, url, max_retries=3, backoff_seconds=45):
    """barttorvik sits behind a CloudFront WAF that rate-limits bursts of
    requests (observed: ~34 rapid requests before a run of 403s). A 403 here
    means "back off", not "bad request" — retry with a long pause rather
    than failing the team outright."""
    for attempt in range(max_retries + 1):
        resp = request_context.get(url, timeout=30000)
        if resp.status == 200:
            return resp.json()
        if resp.status == 403 and attempt < max_retries:
            wait = backoff_seconds * (attempt + 1)
            print(f"  -> 403 (rate limited), backing off {wait}s (attempt {attempt+1}/{max_retries})...")
            time.sleep(wait)
            continue
        raise RuntimeError(f"Unexpected status {resp.status} for {url}")


def parse_team_stats(raw, team_name, year):
    parsed = {"team_name": team_name, "season": year}
    for field, idx in TEAM_FIELD_INDEX.items():
        parsed[field] = raw[idx]
    return parsed


def parse_players(raw_rows, team_name, year):
    players = []
    for row in raw_rows:
        p = {"full_name": row[0], "team_name": team_name, "season": year}
        for field, idx in PLAYER_FIELD_INDEX.items():
            p[field] = row[idx]
        gp = p["gp"] or 0
        if gp:
            total_pts = 2 * (p["two_pm"] or 0) + 3 * (p["three_pm"] or 0) + (p["ftm"] or 0)
            p["pts_per_game"] = round(total_pts / gp, 1)
        else:
            p["pts_per_game"] = None
        players.append(p)
    return players


def scrape_all(year=2026, season_start="20251101", season_end="20260501",
                limit=None, delay_range=(1.5, 3.0), resume=True):
    with open(SCRAPER_DIR / "p4_teams.json") as f:
        teams = json.load(f)
    if limit:
        teams = teams[:limit]

    out_dir = SCRAPER_DIR / "output"
    out_dir.mkdir(exist_ok=True)
    team_stats_path = out_dir / "team_stats.json"
    player_stats_path = out_dir / "player_stats.json"

    all_team_stats = []
    all_players = []
    already_done = set()
    if resume and team_stats_path.exists():
        all_team_stats = json.loads(team_stats_path.read_text())
        all_players = json.loads(player_stats_path.read_text()) if player_stats_path.exists() else []
        already_done = {t["team_name"] for t in all_team_stats}
        if already_done:
            print(f"Resuming: {len(already_done)} teams already scraped, skipping them.")

    errors = []

    with sync_playwright() as p:
        rc = p.request.new_context(extra_http_headers={"User-Agent": USER_AGENT})
        for i, t in enumerate(teams):
            team_name = t["team_name"]
            if team_name in already_done:
                continue
            encoded = team_name.replace(" ", "%20").replace("&", "%26")
            try:
                team_raw = fetch_json(rc, TEAMSLICE_URL.format(year=year, team=encoded))
                team_stats = parse_team_stats(team_raw, team_name, year)
                team_stats["conference"] = t["conference"]
                all_team_stats.append(team_stats)

                time.sleep(random.uniform(*delay_range))

                player_raw = fetch_json(
                    rc,
                    PLAYER_URL.format(year=year, start=season_start, end=season_end, team=encoded),
                )
                players = parse_players(player_raw, team_name, year)
                all_players.extend(players)

                print(f"[{i+1}/{len(teams)}] {team_name}: OK ({len(players)} players)")

                # checkpoint after every team so a later failure doesn't lose progress
                team_stats_path.write_text(json.dumps(all_team_stats, indent=2))
                player_stats_path.write_text(json.dumps(all_players, indent=2))
            except Exception as e:
                print(f"[{i+1}/{len(teams)}] {team_name}: FAILED ({e})")
                errors.append({"team": team_name, "error": str(e)})

            time.sleep(random.uniform(*delay_range))
        rc.dispose()

    return all_team_stats, all_players, errors


def main():
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else None
    team_stats, players, errors = scrape_all(limit=limit)

    print(f"\nTeams scraped: {len(team_stats)}")
    print(f"Players scraped: {len(players)}")
    print(f"Errors: {len(errors)}")
    if errors:
        print(json.dumps(errors, indent=2))
    print(f"\nSaved to {SCRAPER_DIR}/output/team_stats.json and {SCRAPER_DIR}/output/player_stats.json")


if __name__ == "__main__":
    main()
