import { supabase } from "@/lib/supabase";
import { CURRENT_SEASON, TeamStatsRow } from "@/lib/types";
import { PlayerRow } from "@/lib/player-types";

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

const PLAYER_SELECT =
  "minutes_pct, ortg, usg, efg, ts, oreb_pct, dreb_pct, ast_pct, tov_pct, blk_pct, stl_pct, ftr, pts_per_game, players(player_id, full_name, position, class_year, photo_url, teams(team_id, team_name))";

type PlayerStatsQueryRow = {
  minutes_pct: number;
  ortg: number;
  usg: number;
  efg: number;
  ts: number;
  oreb_pct: number;
  dreb_pct: number;
  ast_pct: number;
  tov_pct: number;
  blk_pct: number;
  stl_pct: number;
  ftr: number;
  pts_per_game: number;
  players:
    | {
        player_id: string;
        full_name: string;
        position: string | null;
        class_year: string | null;
        photo_url: string | null;
        teams: { team_id: string; team_name: string } | { team_id: string; team_name: string }[] | null;
      }
    | {
        player_id: string;
        full_name: string;
        position: string | null;
        class_year: string | null;
        photo_url: string | null;
        teams: { team_id: string; team_name: string } | { team_id: string; team_name: string }[] | null;
      }[]
    | null;
};

function mapPlayerRow(data: PlayerStatsQueryRow): PlayerRow | null {
  const player = Array.isArray(data.players) ? data.players[0] : data.players;
  if (!player) return null;
  const team = Array.isArray(player.teams) ? player.teams[0] : player.teams;

  return {
    player_id: player.player_id,
    full_name: player.full_name,
    team_id: team?.team_id ?? "",
    team_name: team?.team_name ?? "",
    position: player.position,
    class_year: player.class_year,
    photo_url: player.photo_url,
    minutes_pct: data.minutes_pct,
    ortg: data.ortg,
    usg: data.usg,
    efg: data.efg,
    ts: data.ts,
    oreb_pct: data.oreb_pct,
    dreb_pct: data.dreb_pct,
    ast_pct: data.ast_pct,
    tov_pct: data.tov_pct,
    blk_pct: data.blk_pct,
    stl_pct: data.stl_pct,
    ftr: data.ftr,
    pts_per_game: data.pts_per_game,
  };
}

export async function getPlayerById(playerId: string): Promise<PlayerRow | null> {
  const { data, error } = await supabase
    .from("player_stats")
    .select(PLAYER_SELECT)
    .eq("season", CURRENT_SEASON)
    .eq("player_id", playerId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return mapPlayerRow(data);
}

export async function getAllPlayers(): Promise<PlayerRow[]> {
  const { data, error } = await supabase
    .from("player_stats")
    .select(PLAYER_SELECT)
    .eq("season", CURRENT_SEASON);

  if (error) throw new Error(error.message);

  return (data ?? [])
    .map(mapPlayerRow)
    .filter((p): p is PlayerRow => p !== null);
}
