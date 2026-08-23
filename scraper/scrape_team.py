"""
Step 1 of build order: pull one team's data end-to-end and confirm parsing logic.

Data source: barttorvik.com's teamslicejson.php endpoint — this is the same JSON
feed that team.php's own JS (targetdata) uses to populate the on-page tables, found
by inspecting team.php's network requests and reading its embedded <script> code.

No Cloudflare challenge was encountered on this endpoint even via a lightweight
Playwright APIRequestContext (no full browser page needed) — confirmed against
both team.php's rendered HTML values and a second team (North Carolina) as a
sanity check.

Field index map was reverse-engineered from team.php's inline JS, e.g.:
    $('#adjoe').html(...targetdata[20]...)
    $('#barthag').html(...targetdata[61]...)
"""
import json
import sys
from playwright.sync_api import sync_playwright

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

TEAMSLICE_URL = (
    "https://barttorvik.com/teamslicejson.php"
    "?year={year}&top=365&venue=All&fteam={team}&adjall=0&split=0"
)

# Index into the raw teamslicejson.php array -> field name.
# Confirmed by cross-referencing team.php's inline JS (targetdata[N]) against
# the rendered page values for Duke (2026 season).
FIELD_INDEX = {
    "efg_o": 0,
    "efg_d": 1,
    "ftr_o": 2,
    "ftr_d": 3,
    "tov_o": 4,
    "tov_d": 5,
    "oreb_o": 6,
    # NOTE: torvik's "orbd" is opponent OREB% allowed, i.e. LOWER is better —
    # not a DREB% stat. The spec's section 5 highlighting table (row:
    # "OREB% (defense/DREB) -> Higher") will need to flip to "Lower" for this
    # field once we build the compare-tab highlighting logic.
    "oreb_d": 7,
    "two_per_o": 9,
    "two_per_d": 10,
    "three_per_o": 11,
    "three_per_d": 12,
    "ft_per_o": 13,
    "ft_per_d": 14,
    "three_rate_o": 15,
    "three_rate_d": 16,
    "assist_rate_o": 17,
    "assist_rate_d": 18,
    "adj_t": 19,
    "adj_o": 20,
    "adj_d": 21,
    "barthag_rk": 44,
    "record": 46,
    "num_games": 47,
    "pool_size": 48,
    "barthag": 61,
    "blk_per_o": 62,
    "blk_per_d": 63,
}


def fetch_team_raw(team_name: str, year: int = 2026) -> list:
    url = TEAMSLICE_URL.format(year=year, team=team_name.replace(" ", "%20"))
    with sync_playwright() as p:
        request_context = p.request.new_context(
            extra_http_headers={"User-Agent": USER_AGENT}
        )
        resp = request_context.get(url, timeout=30000)
        if resp.status != 200:
            raise RuntimeError(f"Unexpected status {resp.status} for {url}")
        data = resp.json()
        request_context.dispose()
        return data


def parse_team_stats(raw: list, team_name: str, year: int) -> dict:
    parsed = {"team_name": team_name, "season": year}
    for field, idx in FIELD_INDEX.items():
        parsed[field] = raw[idx]
    return parsed


def main():
    team_name = sys.argv[1] if len(sys.argv) > 1 else "Duke"
    year = int(sys.argv[2]) if len(sys.argv) > 2 else 2026

    print(f"Fetching {team_name} ({year}) from teamslicejson.php ...")
    raw = fetch_team_raw(team_name, year)
    print(f"Raw array length: {len(raw)}")

    stats = parse_team_stats(raw, team_name, year)
    print("\nParsed team_stats row:")
    print(json.dumps(stats, indent=2))

    out_path = f"scraper/{team_name.lower().replace(' ', '_')}_stats.json"
    with open(out_path, "w") as f:
        json.dump(stats, f, indent=2)
    print(f"\nSaved to {out_path}")


if __name__ == "__main__":
    main()
