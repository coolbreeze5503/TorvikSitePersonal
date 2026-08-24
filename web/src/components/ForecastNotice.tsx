export default function ForecastNotice() {
  return (
    <div className="mb-4 px-3 py-2 border border-accent-dim/60 bg-accent-dim/10 rounded text-xs text-foreground/70">
      <span className="font-semibold text-accent">2027 Forecast:</span> our own projection, not
      official Torvik data (Barttorvik has no 2026-27 numbers yet). Rosters are ground-truthed
      against each team&apos;s current ESPN listing, so departed players (graduated, transferred,
      declared for the draft) are excluded. A transfer whose new team hasn&apos;t been confirmed by
      our sources yet is left off entirely rather than shown under the wrong team. Team defensive
      stats and tempo assume similar efficiency to last season.
    </div>
  );
}
