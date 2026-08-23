# Personal CBB Torvik Stats Site — Build Spec

## 1. Project Summary
A personal web app that pulls Barttorvik (T-Rank) college basketball data for P4 (Power 4) teams, keeps it updated daily during the season, and presents it through team/player comparison views, individual player profiles, and a stat glossary.

**Aesthetic:** Black + red color scheme, early-2000s sci-fi typography (angular/display font for headers, clean sans/mono for data tables).

---

## 2. Data Source & Access Notes

- **Source:** barttorvik.com — no official public API.
- **Blocker:** Site has Cloudflare bot-protection ("Verifying your browser") on direct HTTP requests as of Aug 2026. Plain `requests`/BeautifulSoup will NOT work reliably. Use **Playwright** (headless browser) for scraping, or reverse-engineer the underlying data calls if Playwright reveals a JSON/XHR endpoint under the hood.
- **Reference implementations:** `toRvik` and `cbbdata` (R packages by Andrew Weatherman) already wrap this data — useful to inspect their source for exact endpoints/parsing logic, even though we're not using R directly.
- **Update cadence:** Barttorvik updates ~once/day during the season. Daily scheduled pull is sufficient — no need for true real-time polling.

### Known endpoints
| Data | URL pattern |
|---|---|
| Team ratings/factors | `barttorvik.com/team.php?team={TeamName}` |
| Team stats table (sortable) | `barttorvik.com/teamstats.php?year={YYYY}` |
| T-Rank rankings | `barttorvik.com/trank.php?year={YYYY}` |
| Player stats (filterable) | `barttorvik.com/playerstat.php?year={YYYY}&conlimit={CONF}` |
| Individual player page | `barttorvik.com/playerstat.php?p={First+Last}&t={team}` |
| Game-by-game stats | `barttorvik.com/gamestat.php?year={YYYY}` |

Note: exact query params (minmin, start/end date ranges, sort index, etc.) need to be captured via Playwright network inspection once building starts — the ones above are the base pages, not final scraper targets.

### Photos & Logos
- Barttorvik has no player photos or team logos.
- Pull player photos from ESPN/NCAA roster pages (same approach as the fantasy football site).
- Pull team logos from ESPN's team logo CDN (e.g. `a.espncdn.com/i/teamlogos/ncaa/500/{team_id}.png`) or NCAA media assets.
- Store photo/logo URLs in the DB rather than hosting images ourselves, unless links prove unstable.

---

## 3. Scope (Phase 1)

- Power 4 conferences only: ACC, Big Ten, Big 12, SEC.
- Current season only to start (historical seasons = future phase).
- Men's basketball only (unless you want women's CBB too — flag if so).

---

## 4. Site Structure (5 tabs)

### Tab 1 — Team Stats
- Table/grid of all P4 teams with core Torvik metrics: barthag, adj O, adj D, adj tempo, four factors (eFG%, TOV%, OREB%, FTR) offense & defense.
- Sortable by any column.
- Team logo next to team name.

### Tab 2 — Team Compare
- Select 2 teams via dropdown/search.
- Logos displayed next to each team name at top.
- Stats laid out **vertically**, side-by-side columns (Team A | Stat | Team B).
- The better value in each row is **highlighted/shaded** (need to define per-stat which direction is "better" — e.g. lower adj D is better, higher adj O is better).

### Tab 3 — Player Compare
- Select 2 players via dropdown/search (searchable by name or team).
- Photos next to each player's name.
- Same vertical layout with winner-per-row highlighting as Team Compare.
- **Overlapping pie charts**: each player's stat distribution shown as a pie chart layered/overlaid for visual comparison, each player assigned a distinct color (e.g. Player 1 = green, Player 2 = purple), consistent per comparison session.

### Tab 4 — Player Profile
- Triggered by clicking any player name anywhere on the site.
- Shows full individual stat breakdown.
- Solo pie chart of that player's own stat distribution.
- Player photo, team, position, class year.

### Tab 5 — Glossary
- Every stat tracked on the site, with a 1–2 sentence plain-English explanation of what it is and how it's measured (e.g. Barthag, AdjO, AdjD, AdjT, eFG%, TOV%, OREB%, FTR, etc.)
- Static content — written once, updated only if new stats are added.

---

## 5. "Winner Highlighting" Logic

Needs a per-stat directionality map so the comparison views know which value to highlight as "better":

| Stat | Better direction |
|---|---|
| Barthag | Higher |
| AdjO (adjusted offensive efficiency) | Higher |
| AdjD (adjusted defensive efficiency) | **Lower** |
| AdjT (tempo) | Neutral — no highlight (style, not quality) |
| eFG% (offense) | Higher |
| eFG% (defense allowed) | Lower |
| TOV% (offense) | Lower |
| TOV% (defense forced) | Higher |
| OREB% (offense) | Higher |
| OREB% (defense/DREB) | Higher |
| FTR (offense) | Higher |
| FTR (defense allowed) | Lower |

This table should live in code as a config object so it's easy to extend when new stats are added.

---

## 6. Tech Stack Recommendation

- **Scraper:** Python + Playwright, scheduled via GitHub Actions (daily cron during season, e.g. 6am ET).
- **Database:** Postgres via Supabase (free tier) — gives you a hosted DB + easy REST/query layer without managing your own server.
- **Frontend:** Next.js (React) — good fit for the tab-based navigation, dynamic routes for player profile pages (`/player/[id]`), and charting libraries.
- **Charts:** Recharts or Chart.js for the pie charts (both support custom colors per dataset, needed for the overlapping player-comparison charts).
- **Hosting:** Vercel (pairs natively with Next.js, free tier is plenty for personal use).
- **Fonts:** Google Fonts has several free early-2000s-sci-fi-style display fonts (e.g. Orbitron, Michroma, Rajdhani) usable for headers; pair with a clean readable sans (Inter, IBM Plex Sans) for stat tables so numbers stay legible.

---

## 7. Database Schema (draft)

```sql
-- Teams
CREATE TABLE teams (
  team_id TEXT PRIMARY KEY,       -- e.g. 'duke', slug or Torvik's team name
  team_name TEXT NOT NULL,
  conference TEXT NOT NULL,       -- ACC, B10, B12, SEC
  logo_url TEXT,
  updated_at TIMESTAMP DEFAULT now()
);

-- Team season stats (one row per team per day pulled, or upsert daily on team_id+season)
CREATE TABLE team_stats (
  id SERIAL PRIMARY KEY,
  team_id TEXT REFERENCES teams(team_id),
  season INT NOT NULL,
  barthag NUMERIC,
  adj_o NUMERIC,
  adj_d NUMERIC,
  adj_t NUMERIC,
  efg_o NUMERIC,
  efg_d NUMERIC,
  tov_o NUMERIC,
  tov_d NUMERIC,
  oreb_o NUMERIC,
  oreb_d NUMERIC,
  ftr_o NUMERIC,
  ftr_d NUMERIC,
  updated_at TIMESTAMP DEFAULT now(),
  UNIQUE(team_id, season)
);

-- Players
CREATE TABLE players (
  player_id TEXT PRIMARY KEY,     -- slug: firstname-lastname-team
  full_name TEXT NOT NULL,
  team_id TEXT REFERENCES teams(team_id),
  position TEXT,
  class_year TEXT,
  photo_url TEXT,
  updated_at TIMESTAMP DEFAULT now()
);

-- Player season stats
CREATE TABLE player_stats (
  id SERIAL PRIMARY KEY,
  player_id TEXT REFERENCES players(player_id),
  season INT NOT NULL,
  minutes_pct NUMERIC,
  ortg NUMERIC,
  usg NUMERIC,
  efg NUMERIC,
  ts NUMERIC,
  oreb_pct NUMERIC,
  dreb_pct NUMERIC,
  ast_pct NUMERIC,
  tov_pct NUMERIC,
  blk_pct NUMERIC,
  stl_pct NUMERIC,
  ftr NUMERIC,
  pts_per_game NUMERIC,
  updated_at TIMESTAMP DEFAULT now(),
  UNIQUE(player_id, season)
);

-- Glossary (static reference content)
CREATE TABLE glossary (
  stat_key TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  description TEXT NOT NULL
);
```

*(Column list is a starting point — final list depends on exactly which fields the Playwright scraper can pull from playerstat.php; some advanced stats like BPM-equivalents may or may not be present.)*

---

## 8. Build Order (suggested)

1. Playwright scraper: get 1 team's data working end-to-end (team.php) → confirm parsing logic.
2. Extend scraper to all P4 teams + player stats.
3. Set up Supabase project, run schema, write scraper → DB upsert logic.
4. Wire up GitHub Actions for daily scheduled run.
5. Scaffold Next.js app, connect to Supabase.
6. Build Team Stats tab (simplest, validates data pipeline visually).
7. Build Team Compare (winner-highlighting logic).
8. Build Player Profile page + solo pie chart.
9. Build Player Compare (overlapping pie charts, distinct colors).
10. Build Glossary tab (static content).
11. Apply styling: black/red theme, sci-fi fonts, logo/photo integration.

---

## 9. Open Questions for Later
- Women's CBB — in scope or not?
- Historical season data — worth adding once current season is stable?
- Any additional advanced stats you want beyond Barttorvik's default set (e.g. from another source)?
