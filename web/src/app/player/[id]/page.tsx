import { notFound } from "next/navigation";
import { getPlayerById } from "@/lib/data";
import { parseSeason, CURRENT_SEASON, FORECAST_SEASON } from "@/lib/types";
import { PLAYER_STAT_ROWS } from "@/lib/player-stat-rows";
import Avatar from "@/components/Avatar";
import SeasonToggle from "@/components/SeasonToggle";
import ForecastNotice from "@/components/ForecastNotice";

export default async function PlayerProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ season?: string }>;
}) {
  const { id } = await params;
  const season = parseSeason((await searchParams).season);
  const player = await getPlayerById(id, season);

  // No row for the requested season doesn't necessarily mean the player
  // doesn't exist -- check the current season before 404ing, so a player
  // with no forecast yet gets an honest "no data" message instead of a
  // broken link.
  if (!player) {
    const fallback = season === CURRENT_SEASON ? null : await getPlayerById(id, CURRENT_SEASON);
    if (!fallback) notFound();

    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Avatar src={fallback.photo_url} fallbackText={fallback.full_name} size={64} />
            <div>
              <h2 className="font-display text-2xl font-bold">{fallback.full_name}</h2>
              <p className="text-sm text-foreground/60">
                {fallback.team_name} · {fallback.position ?? "—"} · {fallback.class_year ?? "—"}
              </p>
            </div>
          </div>
          <SeasonToggle />
        </div>
        <p className="text-sm text-foreground/60">
          No {FORECAST_SEASON} forecast available for this player yet.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Avatar src={player.photo_url} fallbackText={player.full_name} size={64} />
          <div>
            <h2 className="font-display text-2xl font-bold">{player.full_name}</h2>
            <p className="text-sm text-foreground/60">
              {player.team_name} · {player.position ?? "—"} · {player.class_year ?? "—"}
            </p>
          </div>
        </div>
        <SeasonToggle />
      </div>

      {season === FORECAST_SEASON && <ForecastNotice />}

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
