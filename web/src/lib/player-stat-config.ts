import { Direction } from "@/lib/stat-config";
import { PlayerStatKey } from "@/lib/player-stat-rows";

// minutes_pct and usg are treated as neutral (role/opportunity indicators,
// not quality indicators) -- same reasoning as adj_t being neutral for
// teams: descriptive of style/usage, not "better or worse".
export const PLAYER_STAT_DIRECTION: Record<PlayerStatKey, Direction> = {
  pts_per_game: "higher",
  minutes_pct: "neutral",
  ortg: "higher",
  usg: "neutral",
  efg: "higher",
  ts: "higher",
  oreb_pct: "higher",
  dreb_pct: "higher",
  ast_pct: "higher",
  tov_pct: "lower",
  stl_pct: "higher",
  blk_pct: "higher",
  ftr: "higher",
};
