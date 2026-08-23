-- Public read access for the anon key (frontend reads only).
-- Writes stay restricted to the direct Postgres connection used by
-- db/upsert.py (the Supabase "postgres" role bypasses RLS entirely),
-- so no INSERT/UPDATE/DELETE policies are needed here.

CREATE POLICY "public read" ON teams FOR SELECT USING (true);
CREATE POLICY "public read" ON team_stats FOR SELECT USING (true);
CREATE POLICY "public read" ON players FOR SELECT USING (true);
CREATE POLICY "public read" ON player_stats FOR SELECT USING (true);
CREATE POLICY "public read" ON glossary FOR SELECT USING (true);
