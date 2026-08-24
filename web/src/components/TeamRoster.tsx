"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { TeamStatsRow } from "@/lib/types";
import { PlayerRow } from "@/lib/player-types";
import { PLAYER_STAT_ROWS, PlayerStatKey } from "@/lib/player-stat-rows";
import { CURRENT_SEASON } from "@/lib/types";
import Avatar from "@/components/Avatar";

type SortKey = "full_name" | PlayerStatKey;

export default function TeamRoster({
  teams,
  players,
  season = CURRENT_SEASON,
}: {
  teams: TeamStatsRow[];
  players: PlayerRow[];
  season?: number;
}) {
  const sortedTeams = [...teams].sort((a, b) => a.team_name.localeCompare(b.team_name));
  const [teamId, setTeamId] = useState(sortedTeams[0]?.team_id ?? "");
  const [sortKey, setSortKey] = useState<SortKey>("minutes_pct");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const team = teams.find((t) => t.team_id === teamId);

  const roster = useMemo(() => {
    const rows = players.filter((p) => p.team_id === teamId);
    rows.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      let cmp: number;
      if (typeof av === "number" && typeof bv === "number") {
        cmp = av - bv;
      } else {
        cmp = String(av).localeCompare(String(bv));
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [players, teamId, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <select
          aria-label="Team"
          value={teamId}
          onChange={(e) => setTeamId(e.target.value)}
          className="bg-background border border-border rounded px-3 py-2 text-sm"
        >
          {sortedTeams.map((t) => (
            <option key={t.team_id} value={t.team_id}>
              {t.team_name}
            </option>
          ))}
        </select>
        {team && (
          <span className="flex items-center gap-2">
            <Avatar src={team.logo_url} fallbackText={team.team_name} size={28} rounded="none" />
            <span className="font-semibold">{team.team_name}</span>
            <span className="text-xs text-foreground/50">{team.conference}</span>
          </span>
        )}
      </div>

      <div className="overflow-x-auto border border-border rounded">
        <table className="border-collapse w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="bg-white/[.03]">
              <th
                onClick={() => handleSort("full_name")}
                className={`px-3 py-2 text-left font-semibold cursor-pointer select-none border-b border-border hover:text-accent ${
                  sortKey === "full_name" ? "text-accent" : "text-foreground"
                }`}
              >
                Player{sortKey === "full_name" && <span className="ml-1">{sortDir === "asc" ? "▲" : "▼"}</span>}
              </th>
              <th className="px-3 py-2 text-left font-semibold border-b border-border">Pos</th>
              <th className="px-3 py-2 text-left font-semibold border-b border-border">Class</th>
              {PLAYER_STAT_ROWS.map((row) => {
                const active = row.key === sortKey;
                return (
                  <th
                    key={row.key}
                    onClick={() => handleSort(row.key)}
                    className={`px-3 py-2 text-left font-semibold cursor-pointer select-none border-b border-border hover:text-accent ${
                      active ? "text-accent" : "text-foreground"
                    }`}
                  >
                    {row.label}
                    {active && <span className="ml-1">{sortDir === "asc" ? "▲" : "▼"}</span>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {roster.map((player, i) => (
              <tr
                key={player.player_id}
                className={`border-b border-border/60 hover:bg-accent-dim/20 ${
                  i % 2 === 1 ? "bg-white/[.015]" : ""
                }`}
              >
                <td className="px-3 py-1.5">
                  <Link
                    href={
                      season === CURRENT_SEASON
                        ? `/player/${player.player_id}`
                        : `/player/${player.player_id}?season=${season}`
                    }
                    className="flex items-center gap-2 font-semibold hover:text-accent"
                  >
                    <Avatar src={player.photo_url} fallbackText={player.full_name} size={20} />
                    {player.full_name}
                    {player.is_projected && (
                      <span
                        title="No prior college stats on record for this player (true freshman or international signee) -- these numbers are a rough estimate, not a real projection."
                        className="text-[10px] font-normal px-1 py-0.5 rounded border border-accent-dim/60 text-accent/80 bg-accent-dim/10"
                      >
                        EST
                      </span>
                    )}
                  </Link>
                </td>
                <td className="px-3 py-1.5">{player.position ?? "—"}</td>
                <td className="px-3 py-1.5">{player.class_year ?? "—"}</td>
                {PLAYER_STAT_ROWS.map((row) => (
                  <td key={row.key} className="px-3 py-1.5 font-mono">
                    {player[row.key].toFixed(row.decimals)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
