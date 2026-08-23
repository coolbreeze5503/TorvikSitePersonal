import { PlayerRow } from "@/lib/player-types";

// The stat categories shown in a player's pie chart. Restricted to
// same-scale (0-100) rate stats -- ortg (~90-130), pts_per_game (~0-30),
// and minutes_pct (playing time, not a "stat profile" metric) are excluded
// so one oversized slice doesn't swamp the rest. Shared between the solo
// chart (step 8) and the overlapping two-player chart (step 9).
export type PieStatKey = "efg" | "ts" | "oreb_pct" | "dreb_pct" | "ast_pct" | "tov_pct" | "blk_pct" | "stl_pct" | "usg";

export const PIE_STATS: { key: PieStatKey; label: string }[] = [
  { key: "usg", label: "Usage" },
  { key: "efg", label: "eFG%" },
  { key: "ts", label: "TS%" },
  { key: "oreb_pct", label: "OReb%" },
  { key: "dreb_pct", label: "DReb%" },
  { key: "ast_pct", label: "Ast%" },
  { key: "tov_pct", label: "TOV%" },
  { key: "stl_pct", label: "Stl%" },
  { key: "blk_pct", label: "Blk%" },
];

export function toPieData(player: PlayerRow) {
  return PIE_STATS.map((s) => ({
    key: s.key,
    label: s.label,
    value: player[s.key] ?? 0,
  }));
}
