import { getTeamStats } from "@/lib/data";
import TeamCompare from "@/components/TeamCompare";

export default async function TeamComparePage() {
  const teams = await getTeamStats();

  return (
    <div>
      <h2 className="font-display text-lg font-semibold mb-1">Team Compare</h2>
      <p className="text-sm text-foreground/60 mb-4">
        Highlighted value is the better one for that stat.
      </p>
      <TeamCompare teams={teams} />
    </div>
  );
}
