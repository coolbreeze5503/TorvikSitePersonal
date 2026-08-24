import { getTeamStats } from "@/lib/data";
import { parseSeason, FORECAST_SEASON } from "@/lib/types";
import TeamStatsTable from "@/components/TeamStatsTable";
import SeasonToggle from "@/components/SeasonToggle";
import ForecastNotice from "@/components/ForecastNotice";

export default async function TeamStatsPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string }>;
}) {
  const season = parseSeason((await searchParams).season);
  const teams = await getTeamStats(season);

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-display text-lg font-semibold">Team Stats</h2>
        <SeasonToggle />
      </div>
      <p className="text-sm text-foreground/60 mb-4">
        All {teams.length} Power 4 teams. Click a column to sort.
      </p>
      {season === FORECAST_SEASON && <ForecastNotice />}
      <TeamStatsTable teams={teams} />
    </div>
  );
}
