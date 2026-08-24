export default function ForecastNotice() {
  return (
    <div className="mb-4 px-3 py-2 border border-accent-dim/60 bg-accent-dim/10 rounded text-xs text-foreground/70">
      <span className="font-semibold text-accent">2027 Forecast:</span> our own projection, not
      official Torvik data (Barttorvik has no 2026-27 numbers yet). Returning/transferred players
      carry forward last season&apos;s per-possession stats under their current team; incoming
      freshmen and transfers from outside this dataset aren&apos;t reflected. Team defensive stats
      and tempo assume similar efficiency to last season.
    </div>
  );
}
