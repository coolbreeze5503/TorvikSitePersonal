export type TeamStatsRow = {
  team_id: string;
  team_name: string;
  conference: string;
  logo_url: string | null;
  barthag: number;
  adj_o: number;
  adj_d: number;
  adj_t: number;
  efg_o: number;
  efg_d: number;
  tov_o: number;
  tov_d: number;
  oreb_o: number;
  oreb_d: number;
  ftr_o: number;
  ftr_d: number;
};

export const CURRENT_SEASON = 2026;
export const FORECAST_SEASON = 2027;

export function parseSeason(value: string | undefined): number {
  return value === String(FORECAST_SEASON) ? FORECAST_SEASON : CURRENT_SEASON;
}
