-- Schedules the daily P4 scrape (supabase/functions/daily-scrape) via
-- pg_cron + pg_net, calling the deployed Edge Function on a schedule.
--
-- This replaced a GitHub Actions cron workflow: GH-hosted runner IPs got an
-- immediate 403 from barttorvik's CDN (confirmed via live log — the very
-- first request failed, not just after a burst), pointing at IP-reputation
-- blocking of shared CI/cloud ranges. Deno Deploy's IPs (where Supabase
-- Edge Functions run) were not blocked in testing — 67-68/68 teams
-- succeeded per run, with only occasional single-team 403s.
--
-- Run this once per Supabase project (idempotent — cron.schedule with the
-- same job name updates the existing job rather than duplicating it).

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
    'daily-torvik-scrape',
    '0 11 * * *',  -- 11:00 UTC = 6am EST / 7am EDT (no DST adjustment)
    $$
    SELECT net.http_post(
        url := 'https://oxjutqoulpbwhbksxjpw.supabase.co/functions/v1/daily-scrape',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        timeout_milliseconds := 300000
    );
    $$
);

-- Weekly 2026-27 forecast refresh (supabase/functions/weekly-forecast).
-- Ground-truths each P4 team's roster against that school's own athletics
-- site (not ESPN -- ESPN's roster API 403s every cloud host tried, both
-- Deno Deploy and Vercel, confirmed directly; the schools' own sites are
-- not blocked and were spot-checked to be more current than ESPN anyway).
-- Handles both departures (graduated seniors, confirmed transfers-out) and
-- arrivals (a transfer shows up on their new team as soon as that school
-- posts its roster) automatically -- no manual step needed for either
-- direction anymore. A school that hasn't published a 2026-27 roster page
-- yet is simply left untouched that week rather than having its forecast
-- wiped; scraper/build_forecast.py remains available for an on-demand
-- manual run if you want one before the next Monday.
SELECT cron.schedule(
    'weekly-forecast-refresh',
    '0 11 * * 1',  -- Monday 11:00 UTC = 6am EST / 7am EDT
    $$
    SELECT net.http_post(
        url := 'https://oxjutqoulpbwhbksxjpw.supabase.co/functions/v1/weekly-forecast',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        timeout_milliseconds := 60000
    );
    $$
);

-- To check recent run history:
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;

-- To unschedule:
-- SELECT cron.unschedule('daily-torvik-scrape');
-- SELECT cron.unschedule('weekly-forecast-refresh');
