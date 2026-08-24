"use client";

import { useState } from "react";
import Link from "next/link";
import { PlayerRow } from "@/lib/player-types";
import { PLAYER_STAT_DIRECTION } from "@/lib/player-stat-config";
import { PLAYER_STAT_ROWS } from "@/lib/player-stat-rows";
import PlayerSearchSelect from "@/components/PlayerSearchSelect";
import Avatar from "@/components/Avatar";
import { CURRENT_SEASON } from "@/lib/types";

function PlayerBadge({ player, season }: { player: PlayerRow; season: number }) {
  const href =
    season === CURRENT_SEASON
      ? `/player/${player.player_id}`
      : `/player/${player.player_id}?season=${season}`;
  return (
    <Link href={href} className="flex items-center gap-2 font-semibold hover:text-accent">
      <Avatar src={player.photo_url} fallbackText={player.full_name} size={32} />
      <span>
        {player.full_name}
        {player.is_projected && (
          <span
            title="No prior college stats on record for this player (true freshman or international signee) -- these numbers are a rough estimate, not a real projection."
            className="ml-1.5 text-[10px] font-normal px-1 py-0.5 rounded border border-accent-dim/60 text-accent/80 bg-accent-dim/10"
          >
            EST
          </span>
        )}
        <span className="block text-xs font-normal text-foreground/50">
          {player.team_name} · {player.position ?? "—"} · {player.class_year ?? "—"}
        </span>
      </span>
    </Link>
  );
}

export default function PlayerCompare({
  players,
  season = CURRENT_SEASON,
}: {
  players: PlayerRow[];
  season?: number;
}) {
  const [playerA, setPlayerA] = useState<PlayerRow | undefined>();
  const [playerB, setPlayerB] = useState<PlayerRow | undefined>();

  return (
    <div>
      <div className="flex flex-wrap gap-3 items-start mb-6">
        <PlayerSearchSelect players={players} selected={playerA} onSelect={setPlayerA} label="Player A" />
        <span className="text-foreground/40 mt-2">vs</span>
        <PlayerSearchSelect players={players} selected={playerB} onSelect={setPlayerB} label="Player B" />
      </div>

      {playerA && playerB ? (
        <div className="border border-border rounded overflow-hidden">
          <div className="grid grid-cols-3 items-center px-4 py-3 bg-white/[.03] border-b border-border">
            <PlayerBadge player={playerA} season={season} />
            <span className="text-center text-xs uppercase tracking-wide text-foreground/40">
              Stat
            </span>
            <div className="flex justify-end">
              <PlayerBadge player={playerB} season={season} />
            </div>
          </div>

          {PLAYER_STAT_ROWS.map((row) => {
            const av = playerA[row.key] as number;
            const bv = playerB[row.key] as number;
            const direction = PLAYER_STAT_DIRECTION[row.key];
            let aWins = false;
            let bWins = false;
            if (direction === "higher") {
              aWins = av > bv;
              bWins = bv > av;
            } else if (direction === "lower") {
              aWins = av < bv;
              bWins = bv < av;
            }

            return (
              <div
                key={row.key}
                className="grid grid-cols-3 items-center px-4 py-2 border-b border-border/60 last:border-b-0"
              >
                <div
                  className={`text-left font-mono ${aWins ? "bg-accent-dim/40 -mx-4 px-4 py-2 font-semibold" : ""}`}
                >
                  {av.toFixed(row.decimals)}
                </div>
                <div className="text-center text-xs text-foreground/50">{row.label}</div>
                <div
                  className={`text-right font-mono ${bWins ? "bg-accent-dim/40 -mx-4 px-4 py-2 font-semibold" : ""}`}
                >
                  {bv.toFixed(row.decimals)}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-foreground/50 text-sm">Search and select two players to compare.</p>
      )}
    </div>
  );
}
