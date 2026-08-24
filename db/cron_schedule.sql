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
-- Reduced scope vs. the manual scraper/build_forecast.py: ESPN's roster API
-- (the actual roster ground truth) 403s every cloud host tried -- both
-- Deno Deploy and Vercel, confirmed directly -- so this automated version
-- only uses Torvik's own signals (no ESPN): it correctly drops graduated
-- seniors and confirmed transfers-out each week, but can't discover a new
-- incoming transfer without ESPN. That half stays a manual
-- build_forecast.py run. User's call, asked directly, given the
-- alternative was a paid residential proxy service.
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
