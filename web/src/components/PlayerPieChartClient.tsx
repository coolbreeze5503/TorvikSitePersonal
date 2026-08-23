"use client";

import dynamic from "next/dynamic";
import { PlayerRow } from "@/lib/player-types";

// Recharts generates auto-incrementing internal IDs (clip-path etc.) from a
// module-level counter that isn't reset between the server and client
// render passes, causing a hydration mismatch ("recharts1-clip" vs
// "recharts2-clip") that leaves the chart permanently blank. Rendering it
// client-only sidesteps the mismatch since there's no SSR output to diverge
// from.
const PlayerPieChart = dynamic(() => import("@/components/PlayerPieChart"), {
  ssr: false,
  loading: () => (
    <div className="h-[320px] flex items-center justify-center text-foreground/40 text-sm">
      Loading chart...
    </div>
  ),
});

export default function PlayerPieChartClient({ player }: { player: PlayerRow }) {
  return <PlayerPieChart player={player} />;
}
