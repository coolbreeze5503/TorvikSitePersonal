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
  const [editing, setEditing] = useState(false);
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

  const displayValue = editing ? query : selected?.full_name ?? "";

  return (
    <div className="relative w-64">
      <input
        aria-label={label}
        type="text"
        placeholder={`Search ${label}...`}
        value={displayValue}
        onChange={(e) => {
          setQuery(e.target.value);
          setEditing(true);
          setOpen(true);
        }}
        onFocus={() => {
          setEditing(true);
          setQuery("");
          setOpen(true);
        }}
        onBlur={() =>
          setTimeout(() => {
            setEditing(false);
            setOpen(false);
          }, 150)
        }
        className="w-full bg-background border border-border rounded px-3 py-2 text-sm text-foreground placeholder:text-foreground/40"
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
                  setEditing(false);
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
