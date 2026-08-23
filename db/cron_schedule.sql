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

-- To check recent run history:
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;

-- To unschedule:
-- SELECT cron.unschedule('daily-torvik-scrape');
