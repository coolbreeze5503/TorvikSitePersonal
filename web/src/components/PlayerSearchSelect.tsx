"use client";

import { useMemo, useState } from "react";
import { PlayerRow } from "@/lib/player-types";

export default function PlayerSearchSelect({
  players,
  selected,
  onSelect,
  label,
}: {
  players: PlayerRow[];
  selected: PlayerRow | undefined;
  onSelect: (player: PlayerRow) => void;
  label: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const matches = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return players
      .filter(
        (p) => p.full_name.toLowerCase().includes(q) || p.team_name.toLowerCase().includes(q),
      )
      .slice(0, 20);
  }, [players, query]);

  return (
    <div className="relative w-64">
      <input
        aria-label={label}
        type="text"
        placeholder={selected ? selected.full_name : `Search ${label}...`}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="w-full bg-background border border-border rounded px-3 py-2 text-sm placeholder:text-foreground/40"
      />
      {open && matches.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full max-h-64 overflow-y-auto bg-background border border-border rounded shadow-lg">
          {matches.map((p) => (
            <li key={p.player_id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onSelect(p);
                  setQuery("");
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-accent-dim/30 flex justify-between gap-2"
              >
                <span>{p.full_name}</span>
                <span className="text-foreground/40">{p.team_name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
