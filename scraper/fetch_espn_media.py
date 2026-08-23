"""
Step 11: pull team logos + player headshots from ESPN's public site API and
upsert them into teams.logo_url / players.photo_url.

Two-stage lookup:
1. ESPN's team list gives {location -> espn_id, logo_url}. Torvik's team
   names mostly match ESPN's "location" field directly; the ~12 that don't
   (mostly "St." vs "State" abbreviation, plus Miami/Ole Miss naming) are
   handled by NAME_OVERRIDES below, built by inspecting the diff once.
2. Each team's ESPN roster endpoint returns headshot URLs per player name.
   Matched against our players table by normalized full_name within that
   team_id (name-only matching is safe here since it's scoped per-team,
   not matched against the whole 924-player pool).

Not every player has a photo on ESPN's ready (rare/wallk-on players lack a
professional headshot) -- those are just left NULL, same as if we'd never
run this at all. No error, just a gap the UI already has a placeholder for.
"""
import json
import re
import time
from pathlib import Path

import psycopg2
from dotenv import load_dotenv
import os
import sys
from playwright.sync_api import sync_playwright

SCRAPER_DIR = Path(__file__).parent
load_dotenv(SCRAPER_DIR.parent / "db" / ".env")

ESPN_TEAMS_URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams?limit=400"
ESPN_ROSTER_URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams/{espn_id}/roster"

# Torvik team_name -> ESPN "location" field, for the names that don't match directly.
NAME_OVERRIDES = {
    "Arizona St.": "Arizona State",
    "Florida St.": "Florida State",
    "Iowa St.": "Iowa State",
    "Kansas St.": "Kansas State",
    "Miami FL": "Miami",
    "Michigan St.": "Michigan State",
    "Mississippi": "Ole Miss",
    "Mississippi St.": "Mississippi State",
    "N.C. State": "NC State",
    "Ohio St.": "Ohio State",
    "Oklahoma St.": "Oklahoma State",
    "Penn St.": "Penn State",
}


def slugify(name: str) -> str:
    slug = name.lower()
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    return slug.strip("-")


def normalize_player_name(name: str) -> str:
    name = name.lower().strip()
    name = re.sub(r"[.\']", "", name)
    name = re.sub(r"\s+(jr|sr|ii|iii|iv)\.?$", "", name)
    name = re.sub(r"\s+", " ", name)
    return name


def fetch_json(request_context, url):
    resp = request_context.get(url, timeout=30000)
    if resp.status != 200:
        raise RuntimeError(f"status {resp.status} for {url}")
    return resp.json()


def build_team_espn_map(request_context, p4_teams):
    data = fetch_json(request_context, ESPN_TEAMS_URL)
    espn_teams = data["sports"][0]["leagues"][0]["teams"]
    by_location = {}
    for t in espn_teams:
        team = t["team"]
        loc = team.get("location", "").strip()
        logos = team.get("logos") or []
        by_location[loc] = {
            "espn_id": team.get("id"),
            "logo_url": logos[0]["href"] if logos else None,
        }

    result = {}
    for t in p4_teams:
        name = t["team_name"]
        espn_name = NAME_OVERRIDES.get(name, name)
        match = by_location.get(espn_name)
        if match:
            result[name] = match
        else:
            print(f"  WARNING: no ESPN match for {name!r}")
    return result


def main():
    with open(SCRAPER_DIR / "p4_teams.json") as f:
        p4_teams = json.load(f)

    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor()

    with sync_playwright() as p:
        rc = p.request.new_context(
            extra_http_headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"}
        )

        print("Building team -> ESPN id map...")
        team_espn_map = build_team_espn_map(rc, p4_teams)
        print(f"  {len(team_espn_map)}/{len(p4_teams)} teams resolved")

        # Fetch our players once, grouped by team_id, for matching.
        cur.execute("SELECT player_id, full_name, team_id FROM players")
        players_by_team = {}
        for player_id, full_name, team_id in cur.fetchall():
            players_by_team.setdefault(team_id, []).append((player_id, full_name))

        logos_updated = 0
        photos_matched = 0
        photos_total_players = 0

        for i, t in enumerate(p4_teams):
            team_name = t["team_name"]
            team_id = slugify(team_name)
            espn = team_espn_map.get(team_name)
            if not espn:
                continue

            if espn["logo_url"]:
                cur.execute(
                    "UPDATE teams SET logo_url = %s WHERE team_id = %s",
                    (espn["logo_url"], team_id),
                )
                logos_updated += 1

            try:
                roster = fetch_json(rc, ESPN_ROSTER_URL.format(espn_id=espn["espn_id"]))
                athletes = roster.get("athletes", [])
                # Some responses group by position; flatten if needed.
                if athletes and isinstance(athletes[0], dict) and "items" in athletes[0]:
                    flat = [p for group in athletes for p in group["items"]]
                else:
                    flat = athletes

                espn_by_norm_name = {}
                for p in flat:
                    headshot = p.get("headshot")
                    if headshot and headshot.get("href"):
                        espn_by_norm_name[normalize_player_name(p["fullName"])] = headshot["href"]

                team_players = players_by_team.get(team_id, [])
                photos_total_players += len(team_players)
                for player_id, full_name in team_players:
                    photo_url = espn_by_norm_name.get(normalize_player_name(full_name))
                    if photo_url:
                        cur.execute(
                            "UPDATE players SET photo_url = %s WHERE player_id = %s",
                            (photo_url, player_id),
                        )
                        photos_matched += 1

                print(f"[{i+1}/{len(p4_teams)}] {team_name}: logo OK, "
                      f"{sum(1 for pid, n in team_players if normalize_player_name(n) in espn_by_norm_name)}/"
                      f"{len(team_players)} photos matched")
            except Exception as e:
                print(f"[{i+1}/{len(p4_teams)}] {team_name}: roster fetch FAILED ({e})")

            conn.commit()
            time.sleep(0.3)

        rc.dispose()

    print(f"\nLogos updated: {logos_updated}/{len(p4_teams)}")
    print(f"Photos matched: {photos_matched}/{photos_total_players}")
    conn.close()


if __name__ == "__main__":
    main()
