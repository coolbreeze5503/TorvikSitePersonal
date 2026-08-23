import { TeamStatsRow } from "@/lib/types";

export type StatKey = Exclude<keyof TeamStatsRow, "team_id" | "team_name" | "conference">;

export const STAT_ROWS: { key: StatKey; label: string; decimals: number }[] = [
  { key: "barthag", label: "Barthag", decimals: 4 },
  { key: "adj_o", label: "AdjO", decimals: 1 },
  { key: "adj_d", label: "AdjD", decimals: 1 },
  { key: "adj_t", label: "AdjT", decimals: 1 },
  { key: "efg_o", label: "eFG% O", decimals: 1 },
  { key: "efg_d", label: "eFG% D", decimals: 1 },
  { key: "tov_o", label: "TOV% O", decimals: 1 },
  { key: "tov_d", label: "TOV% D", decimals: 1 },
  { key: "oreb_o", label: "OREB% O", decimals: 1 },
  { key: "oreb_d", label: "OREB% D", decimals: 1 },
  { key: "ftr_o", label: "FTR O", decimals: 1 },
  { key: "ftr_d", label: "FTR D", decimals: 1 },
];
