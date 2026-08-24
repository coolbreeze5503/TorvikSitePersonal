import { getTeamStats, getAllPlayers } from "@/lib/data";
import { parseSeason, FORECAST_SEASON } from "@/lib/types";
import TeamRoster from "@/components/TeamRoster";
import SeasonToggle from "@/components/SeasonToggle";
import ForecastNotice from "@/components/ForecastNotice";

export default async function RosterPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string }>;
}) {
  const season = parseSeason((await searchParams).season);
  const [teams, players] = await Promise.all([getTeamStats(season), getAllPlayers(season)]);

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-display text-lg font-semibold">Roster</h2>
        <SeasonToggle />
      </div>
      <p className="text-sm text-foreground/60 mb-4">
        Select a team to see its full roster. Click a player to see their stats.
      </p>
      {season === FORECAST_SEASON && <ForecastNotice />}
      <TeamRoster teams={teams} players={players} season={season} />
    </div>
  );
}
