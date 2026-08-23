import { getTeamStats } from "@/lib/data";
import TeamStatsTable from "@/components/TeamStatsTable";

export default async function TeamStatsPage() {
  const teams = await getTeamStats();

  return (
    <div>
      <h2 className="font-display text-lg font-semibold mb-1">Team Stats</h2>
      <p className="text-sm text-foreground/60 mb-4">
        All {teams.length} Power 4 teams. Click a column to sort.
      </p>
      <TeamStatsTable teams={teams} />
    </div>
  );
}
