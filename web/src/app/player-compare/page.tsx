import { getAllPlayers } from "@/lib/data";
import { parseSeason, FORECAST_SEASON } from "@/lib/types";
import PlayerCompare from "@/components/PlayerCompare";
import SeasonToggle from "@/components/SeasonToggle";
import ForecastNotice from "@/components/ForecastNotice";

export default async function PlayerComparePage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string }>;
}) {
  const season = parseSeason((await searchParams).season);
  const players = await getAllPlayers(season);

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-display text-lg font-semibold">Player Compare</h2>
        <SeasonToggle />
      </div>
      <p className="text-sm text-foreground/60 mb-4">
        Highlighted value is the better one for that stat.
      </p>
      {season === FORECAST_SEASON && <ForecastNotice />}
      <PlayerCompare players={players} season={season} />
    </div>
  );
}
