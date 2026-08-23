"use client";

import dynamic from "next/dynamic";
import { PlayerRow } from "@/lib/player-types";

const OverlappingPieChart = dynamic(() => import("@/components/OverlappingPieChart"), {
  ssr: false,
  loading: () => (
    <div className="h-[320px] flex items-center justify-center text-foreground/40 text-sm">
      Loading chart...
    </div>
  ),
});

export default function OverlappingPieChartClient({
  playerA,
  playerB,
}: {
  playerA: PlayerRow;
  playerB: PlayerRow;
}) {
  return <OverlappingPieChart playerA={playerA} playerB={playerB} />;
}
