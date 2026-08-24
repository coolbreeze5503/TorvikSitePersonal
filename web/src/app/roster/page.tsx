import { getTeamStats, getAllPlayers } from "@/lib/data";
import TeamRoster from "@/components/TeamRoster";

export default async function RosterPage() {
  const [teams, players] = await Promise.all([getTeamStats(), getAllPlayers()]);

  return (
    <div>
      <h2 className="font-display text-lg font-semibold mb-1">Roster</h2>
      <p className="text-sm text-foreground/60 mb-4">
        Select a team to see its full roster. Click a player to see their stats.
      </p>
      <TeamRoster teams={teams} players={players} />
    </div>
  );
}
