-- Torvik Site — Postgres schema (Supabase)
-- Matches torvik-site-spec_1.md section 7.

-- Teams
CREATE TABLE teams (
  team_id TEXT PRIMARY KEY,       -- slug, e.g. 'duke', 'n-c-state'
  team_name TEXT NOT NULL,        -- Torvik's display name, e.g. 'N.C. State'
  conference TEXT NOT NULL,       -- ACC, B10, B12, SEC
  logo_url TEXT,
  updated_at TIMESTAMP DEFAULT now()
);

-- Team season stats (upsert daily on team_id+season)
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
  player_id TEXT PRIMARY KEY,     -- Torvik's internal numeric player id (stable across transfers)
  full_name TEXT NOT NULL,
  team_id TEXT REFERENCES teams(team_id),  -- team they actually played for in the CURRENT_SEASON (2025-26); fixed historical fact, do not overwrite for transfers
  forecast_team_id TEXT REFERENCES teams(team_id),  -- team they're on for FORECAST_SEASON (2026-27), per ESPN's current roster; NULL if graduated/departed/unknown -- see scraper/build_forecast.py
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
  is_projected BOOLEAN NOT NULL DEFAULT false,  -- true for a FORECAST_SEASON row with no real prior-season stats to carry forward (true freshman / international signee) -- see supabase/functions/weekly-forecast
  updated_at TIMESTAMP DEFAULT now(),
  UNIQUE(player_id, season)
);

-- Glossary (static reference content)
CREATE TABLE glossary (
  stat_key TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  description TEXT NOT NULL
);
