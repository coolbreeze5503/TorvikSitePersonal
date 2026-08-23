"use client";

import { useState } from "react";
import { TeamStatsRow } from "@/lib/types";
import { STAT_DIRECTION } from "@/lib/stat-config";
import { STAT_ROWS } from "@/lib/stat-rows";

function TeamBadge({ team }: { team?: TeamStatsRow }) {
  if (!team) return <span className="text-foreground/40">Select a team</span>;
  return (
    <span className="flex items-center gap-2 font-semibold">
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-accent-dim text-sm font-bold text-white">
        {team.team_name.charAt(0)}
      </span>
      {team.team_name}
      <span className="text-xs font-normal text-foreground/50">{team.conference}</span>
    </span>
  );
}

function TeamSelect({
  teams,
  value,
  onChange,
  label,
}: {
  teams: TeamStatsRow[];
  value: string;
  onChange: (id: string) => void;
  label: string;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-background border border-border rounded px-3 py-2 text-sm"
    >
      <option value="">Select {label}...</option>
      {teams.map((t) => (
        <option key={t.team_id} value={t.team_id}>
          {t.team_name}
        </option>
      ))}
    </select>
  );
}

export default function TeamCompare({ teams }: { teams: TeamStatsRow[] }) {
  const sorted = [...teams].sort((a, b) => a.team_name.localeCompare(b.team_name));
  const [aId, setAId] = useState(sorted[0]?.team_id ?? "");
  const [bId, setBId] = useState(sorted[1]?.team_id ?? "");

  const teamA = teams.find((t) => t.team_id === aId);
  const teamB = teams.find((t) => t.team_id === bId);

  return (
    <div>
      <div className="flex flex-wrap gap-3 items-center mb-6">
        <TeamSelect teams={sorted} value={aId} onChange={setAId} label="Team A" />
        <span className="text-foreground/40">vs</span>
        <TeamSelect teams={sorted} value={bId} onChange={setBId} label="Team B" />
      </div>

      {teamA && teamB ? (
        <div className="border border-border rounded overflow-hidden">
          <div className="grid grid-cols-3 items-center px-4 py-3 bg-white/[.03] border-b border-border">
            <TeamBadge team={teamA} />
            <span className="text-center text-xs uppercase tracking-wide text-foreground/40">
              Stat
            </span>
            <div className="flex justify-end">
              <TeamBadge team={teamB} />
            </div>
          </div>

          {STAT_ROWS.map((row) => {
            const av = teamA[row.key] as number;
            const bv = teamB[row.key] as number;
            const direction = STAT_DIRECTION[row.key];
            let aWins = false;
            let bWins = false;
            if (direction === "higher") {
              aWins = av > bv;
              bWins = bv > av;
            } else if (direction === "lower") {
              aWins = av < bv;
              bWins = bv < av;
            }

            return (
              <div
                key={row.key}
                className="grid grid-cols-3 items-center px-4 py-2 border-b border-border/60 last:border-b-0"
              >
                <div
                  className={`text-left ${aWins ? "bg-accent-dim/40 -mx-4 px-4 py-2 font-semibold" : ""}`}
                >
                  {av.toFixed(row.decimals)}
                </div>
                <div className="text-center text-xs text-foreground/50">{row.label}</div>
                <div
                  className={`text-right ${bWins ? "bg-accent-dim/40 -mx-4 px-4 py-2 font-semibold" : ""}`}
                >
                  {bv.toFixed(row.decimals)}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-foreground/50 text-sm">Select two teams to compare.</p>
      )}
    </div>
  );
}
