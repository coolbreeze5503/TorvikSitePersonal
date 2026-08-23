"use client";

import { useMemo, useState } from "react";
import { TeamStatsRow } from "@/lib/types";
import { STAT_DIRECTION } from "@/lib/stat-config";
import { STAT_ROWS } from "@/lib/stat-rows";
import Avatar from "@/components/Avatar";

type Column = {
  key: keyof TeamStatsRow;
  label: string;
  decimals?: number;
};

const COLUMNS: Column[] = [
  { key: "team_name", label: "Team" },
  { key: "conference", label: "Conf" },
  ...STAT_ROWS,
];

function defaultDirection(key: keyof TeamStatsRow): "asc" | "desc" {
  const dir = STAT_DIRECTION[key as string];
  return dir === "lower" ? "asc" : "desc";
}

export default function TeamStatsTable({ teams }: { teams: TeamStatsRow[] }) {
  const [sortKey, setSortKey] = useState<keyof TeamStatsRow>("barthag");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(() => {
    const rows = [...teams];
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
  }, [teams, sortKey, sortDir]);

  function handleSort(key: keyof TeamStatsRow) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(defaultDirection(key));
    }
  }

  return (
    <div className="overflow-x-auto border border-border rounded">
      <table className="border-collapse w-full text-sm whitespace-nowrap">
        <thead>
          <tr className="bg-white/[.03]">
            {COLUMNS.map((col) => {
              const active = col.key === sortKey;
              return (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className={`px-3 py-2 text-left font-semibold cursor-pointer select-none border-b border-border hover:text-accent ${
                    active ? "text-accent" : "text-foreground"
                  }`}
                >
                  {col.label}
                  {active && <span className="ml-1">{sortDir === "asc" ? "▲" : "▼"}</span>}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((team, i) => (
            <tr
              key={team.team_id}
              className={`border-b border-border/60 hover:bg-accent-dim/20 ${
                i % 2 === 1 ? "bg-white/[.015]" : ""
              }`}
            >
              {COLUMNS.map((col) => {
                const value = team[col.key];
                const display =
                  col.decimals != null && typeof value === "number"
                    ? value.toFixed(col.decimals)
                    : value;
                return (
                  <td
                    key={col.key}
                    className={`px-3 py-1.5 ${col.decimals != null ? "font-mono" : ""}`}
                  >
                    {col.key === "team_name" ? (
                      <span className="flex items-center gap-2">
                        <Avatar src={team.logo_url} fallbackText={team.team_name} size={20} rounded="none" />
                        {team.team_name}
                      </span>
                    ) : (
                      display
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
