import { PlayerRow } from "@/lib/player-types";

export type PlayerStatKey = Exclude<
  keyof PlayerRow,
  "player_id" | "full_name" | "team_id" | "team_name" | "position" | "class_year" | "photo_url" | "is_projected"
>;

export const PLAYER_STAT_ROWS: { key: PlayerStatKey; label: string; decimals: number }[] = [
  { key: "pts_per_game", label: "Pts/G", decimals: 1 },
  { key: "minutes_pct", label: "Min%", decimals: 1 },
  { key: "ortg", label: "ORtg", decimals: 1 },
  { key: "usg", label: "Usage%", decimals: 1 },
  { key: "efg", label: "eFG%", decimals: 1 },
  { key: "ts", label: "TS%", decimals: 1 },
  { key: "oreb_pct", label: "OReb%", decimals: 1 },
  { key: "dreb_pct", label: "DReb%", decimals: 1 },
  { key: "ast_pct", label: "Ast%", decimals: 1 },
  { key: "tov_pct", label: "TOV%", decimals: 1 },
  { key: "stl_pct", label: "Stl%", decimals: 1 },
  { key: "blk_pct", label: "Blk%", decimals: 1 },
  { key: "ftr", label: "FTR", decimals: 1 },
];
