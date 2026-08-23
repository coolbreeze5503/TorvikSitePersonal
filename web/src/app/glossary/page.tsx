import { getGlossary, GlossaryEntry } from "@/lib/data";
import { STAT_ROWS } from "@/lib/stat-rows";
import { PLAYER_STAT_ROWS } from "@/lib/player-stat-rows";

function Section({
  title,
  keys,
  byKey,
}: {
  title: string;
  keys: string[];
  byKey: Map<string, GlossaryEntry>;
}) {
  return (
    <div className="mb-8">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground/50 mb-3">
        {title}
      </h3>
      <div className="border border-border rounded overflow-hidden">
        {keys.map((key, i) => {
          const entry = byKey.get(key);
          if (!entry) return null;
          return (
            <div
              key={key}
              className={`px-4 py-3 border-b border-border/60 last:border-b-0 ${
                i % 2 === 1 ? "bg-white/[.015]" : ""
              }`}
            >
              <div className="font-semibold text-accent">{entry.display_name}</div>
              <div className="text-sm text-foreground/70 mt-0.5">{entry.description}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default async function GlossaryPage() {
  const entries = await getGlossary();
  const byKey = new Map(entries.map((e) => [e.stat_key, e]));

  const teamKeys = STAT_ROWS.map((r) => r.key);
  const playerKeys = PLAYER_STAT_ROWS.map((r) => r.key);

  return (
    <div>
      <h2 className="font-display text-lg font-semibold mb-1">Glossary</h2>
      <p className="text-sm text-foreground/60 mb-4">
        What every stat on this site means and how it&apos;s measured.
      </p>
      <Section title="Team Stats" keys={teamKeys} byKey={byKey} />
      <Section title="Player Stats" keys={playerKeys} byKey={byKey} />
    </div>
  );
}
