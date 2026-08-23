import { getAllPlayers } from "@/lib/data";
import PlayerCompare from "@/components/PlayerCompare";

export default async function PlayerComparePage() {
  const players = await getAllPlayers();

  return (
    <div>
      <h2 className="font-display text-lg font-semibold mb-1">Player Compare</h2>
      <p className="text-sm text-foreground/60 mb-4">
        Highlighted value is the better one for that stat.
      </p>
      <PlayerCompare players={players} />
    </div>
  );
}
