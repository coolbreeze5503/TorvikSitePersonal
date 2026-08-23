// Per-stat "which direction is better" map, per spec section 5.
//
// One correction from the spec's draft table: oreb_d is documented there as
// "OREB% (defense/DREB) -> Higher is better", but Torvik's actual oreb_d
// field is opponent OREB% allowed (confirmed against team.php's four-factor
// box for Duke: OR% row showed offense 38.4 and defense 25.2 both shaded
// green/"good", with defense ranked by ascending value) — so lower is
// better for oreb_d, same shape as the other *_d fields.

export type Direction = "higher" | "lower" | "neutral";

export const STAT_DIRECTION: Record<string, Direction> = {
  barthag: "higher",
  adj_o: "higher",
  adj_d: "lower",
  adj_t: "neutral",
  efg_o: "higher",
  efg_d: "lower",
  tov_o: "lower",
  tov_d: "higher",
  oreb_o: "higher",
  oreb_d: "lower",
  ftr_o: "higher",
  ftr_d: "lower",
};
