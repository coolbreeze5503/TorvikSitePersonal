import { supabase } from "@/lib/supabase";
import { CURRENT_SEASON, FORECAST_SEASON, TeamStatsRow } from "@/lib/types";
import { PlayerRow } from "@/lib/player-types";

export type GlossaryEntry = {
  stat_key: string;
  display_name: string;
  description: string;
};

export async function getGlossary(): Promise<GlossaryEntry[]> {
  const { data, error } = await supabase
    .from("glossary")
    .select("stat_key, display_name, description")
    .order("stat_key");

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getTeamStats(season: number = CURRENT_SEASON): Promise<TeamStatsRow[]> {
  const { data, error } = await supabase
    .from("team_stats")
    .select(
      "team_id, barthag, adj_o, adj_d, adj_t, efg_o, efg_d, tov_o, tov_d, oreb_o, oreb_d, ftr_o, ftr_d, teams(team_name, conference, logo_url)",
    )
    .eq("season", season);

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const team = Array.isArray(row.teams) ? row.teams[0] : row.teams;
    return {
      team_id: row.team_id,
      team_name: team?.team_name ?? row.team_id,
      conference: team?.conference ?? "",
      logo_url: team?.logo_url ?? null,
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

// players has two FKs to teams: team_id (who they actually played for in
// CURRENT_SEASON, a fixed historical fact) and forecast_team_id (who
// they're on for FORECAST_SEASON, per ESPN's current roster -- see
// scraper/build_forecast.py). Both team relationships are selected and the
// right one is picked in mapPlayerRow based on the requested season, since
// a single players.team_id can't represent both at once.
const PLAYER_SELECT =
  "minutes_pct, ortg, usg, efg, ts, oreb_pct, dreb_pct, ast_pct, tov_pct, blk_pct, stl_pct, ftr, pts_per_game, " +
  "players(player_id, full_name, position, class_year, photo_url, " +
  "current_team:teams!players_team_id_fkey(team_id, team_name), " +
  "forecast_team:teams!players_forecast_team_id_fkey(team_id, team_name))";

type TeamRef = { team_id: string; team_name: string } | { team_id: string; team_name: string }[] | null;

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
        current_team: TeamRef;
        forecast_team: TeamRef;
      }
    | {
        player_id: string;
        full_name: string;
        position: string | null;
        class_year: string | null;
        photo_url: string | null;
        current_team: TeamRef;
        forecast_team: TeamRef;
      }[]
    | null;
};

function mapPlayerRow(data: PlayerStatsQueryRow, season: number): PlayerRow | null {
  const player = Array.isArray(data.players) ? data.players[0] : data.players;
  if (!player) return null;

  const teamRef = season === FORECAST_SEASON ? player.forecast_team : player.current_team;
  const team = Array.isArray(teamRef) ? teamRef[0] : teamRef;
  // A player with no team for the requested season (departed/graduated,
  // no forecast) has nothing meaningful to show -- treat as not found
  // rather than rendering a blank team.
  if (!team) return null;

  return {
    player_id: player.player_id,
    full_name: player.full_name,
    team_id: team.team_id,
    team_name: team.team_name,
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

export async function getPlayerById(
  playerId: string,
  season: number = CURRENT_SEASON,
): Promise<PlayerRow | null> {
  const { data, error } = await supabase
    .from("player_stats")
    .select(PLAYER_SELECT)
    .eq("season", season)
    .eq("player_id", playerId)
    .maybeSingle()
    .returns<PlayerStatsQueryRow>();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return mapPlayerRow(data, season);
}

export async function getAllPlayers(season: number = CURRENT_SEASON): Promise<PlayerRow[]> {
  const { data, error } = await supabase
    .from("player_stats")
    .select(PLAYER_SELECT)
    .eq("season", season)
    .returns<PlayerStatsQueryRow[]>();

  if (error) throw new Error(error.message);

  return (data ?? [])
    .map((row) => mapPlayerRow(row, season))
    .filter((p): p is PlayerRow => p !== null);
}
