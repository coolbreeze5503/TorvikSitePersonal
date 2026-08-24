import { notFound } from "next/navigation";
import { getPlayerById } from "@/lib/data";
import { PLAYER_STAT_ROWS } from "@/lib/player-stat-rows";
import Avatar from "@/components/Avatar";

export default async function PlayerProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const player = await getPlayerById(id);

  if (!player) notFound();

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Avatar src={player.photo_url} fallbackText={player.full_name} size={64} />
        <div>
          <h2 className="font-display text-2xl font-bold">{player.full_name}</h2>
          <p className="text-sm text-foreground/60">
            {player.team_name} · {player.position ?? "—"} · {player.class_year ?? "—"}
          </p>
        </div>
      </div>

      <div className="border border-border rounded overflow-hidden max-w-md">
        {PLAYER_STAT_ROWS.map((row, i) => (
          <div
            key={row.key}
            className={`flex justify-between px-4 py-2 border-b border-border/60 last:border-b-0 ${
              i % 2 === 1 ? "bg-white/[.015]" : ""
            }`}
          >
            <span className="text-foreground/60 text-sm">{row.label}</span>
            <span className="font-mono font-semibold">{player[row.key].toFixed(row.decimals)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
