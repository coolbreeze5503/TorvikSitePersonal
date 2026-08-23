-- Static reference content for the Glossary tab (spec section 4 tab 5).
-- stat_key values match the field names used throughout the app (team_stats
-- / player_stats columns). Team and player versions of the "same" concept
-- (e.g. efg_o/efg_d vs efg) get separate rows since they measure different
-- things (team-level vs individual-level).

INSERT INTO glossary (stat_key, display_name, description) VALUES
('barthag', 'Barthag', 'Barttorvik''s power rating: the estimated win probability against an average Division I team on a neutral court, from 0 to 1.'),
('adj_o', 'AdjO (Adjusted Offensive Efficiency)', 'Points scored per 100 possessions, adjusted for the strength of the defenses faced. Higher is better.'),
('adj_d', 'AdjD (Adjusted Defensive Efficiency)', 'Points allowed per 100 possessions, adjusted for the strength of the offenses faced. Lower is better.'),
('adj_t', 'AdjT (Adjusted Tempo)', 'Estimated possessions per 40 minutes, adjusted for opponent pace. A measure of speed of play, not quality.'),
('efg_o', 'eFG% (Offense)', 'Effective field goal percentage: field goal percentage weighted to give 3-pointers extra credit, since they''re worth more. This is a team''s own shooting efficiency.'),
('efg_d', 'eFG% (Defense)', 'Effective field goal percentage allowed to opponents. Lower is better.'),
('tov_o', 'TOV% (Offense)', 'The percentage of a team''s own possessions that end in a turnover. Lower is better.'),
('tov_d', 'TOV% (Defense)', 'The percentage of opponent possessions a team forces into a turnover. Higher is better.'),
('oreb_o', 'OREB% (Offense)', 'The percentage of its own missed shots a team rebounds. Higher is better.'),
('oreb_d', 'OREB% (Defense)', 'The percentage of a team''s own missed shots that opponents rebound (i.e. offensive rebounds allowed). Lower is better.'),
('ftr_o', 'FTR (Offense)', 'Free throw rate: free throw attempts divided by field goal attempts. Measures how often a team gets to the line.'),
('ftr_d', 'FTR (Defense)', 'Free throw rate allowed to opponents. Lower is better.'),
('pts_per_game', 'Pts/G', 'Average points scored per game.'),
('minutes_pct', 'Min%', 'The percentage of available team minutes a player was on the floor for.'),
('ortg', 'ORtg (Offensive Rating)', 'Points produced per 100 individual possessions used -- an efficiency measure of a player''s offensive production.'),
('usg', 'Usage%', 'The percentage of a team''s offensive possessions that end with this player shooting, turning the ball over, or drawing a shooting foul while on the floor.'),
('efg', 'eFG% (Player)', 'A player''s own effective field goal percentage -- shooting percentage weighted to credit 3-pointers appropriately.'),
('ts', 'TS% (True Shooting)', 'Shooting efficiency accounting for field goals, 3-pointers, and free throws together in one number.'),
('oreb_pct', 'OReb%', 'The percentage of available offensive rebounds a player grabs while on the floor.'),
('dreb_pct', 'DReb%', 'The percentage of available defensive rebounds a player grabs while on the floor.'),
('ast_pct', 'Ast%', 'The percentage of teammate made field goals a player assisted while on the floor.'),
('tov_pct', 'TOV% (Player)', 'The percentage of a player''s own individual possessions that end in a turnover.'),
('stl_pct', 'Stl%', 'The percentage of opponent possessions a player ends with a steal while on the floor.'),
('blk_pct', 'Blk%', 'The percentage of opponent 2-point attempts a player blocks while on the floor.'),
('ftr', 'FTR (Player)', 'Free throw rate: a player''s free throw attempts divided by field goal attempts. Measures how often they get to the line.')
ON CONFLICT (stat_key) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description;
