import { supabase } from "@/lib/supabase";
import { CURRENT_SEASON, TeamStatsRow } from "@/lib/types";

export async function getTeamStats(): Promise<TeamStatsRow[]> {
  const { data, error } = await supabase
    .from("team_stats")
    .select(
      "team_id, barthag, adj_o, adj_d, adj_t, efg_o, efg_d, tov_o, tov_d, oreb_o, oreb_d, ftr_o, ftr_d, teams(team_name, conference)",
    )
    .eq("season", CURRENT_SEASON);

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const team = Array.isArray(row.teams) ? row.teams[0] : row.teams;
    return {
      team_id: row.team_id,
      team_name: team?.team_name ?? row.team_id,
      conference: team?.conference ?? "",
      barthag: row.barthag,
      adj_o: row.adj_o,
      adj_d: row.adj_d,
      adj_t: row.adj_t,
      efg_o: row.efg_o,
      efg_d: row.efg_d,
      tov_o: row.tov_o,
      tov_d: row.tov_d,
      oreb_o: row.oreb_o,
      oreb_d: row.oreb_d,
      ftr_o: row.ftr_o,
      ftr_d: row.ftr_d,
    };
  });
}
