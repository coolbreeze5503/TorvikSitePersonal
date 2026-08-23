"use client";

import { Chart as ChartJS, ArcElement, PieController, Tooltip } from "chart.js";
import { Pie } from "react-chartjs-2";
import { PlayerRow } from "@/lib/player-types";
import { toPieData } from "@/lib/pie-stats";

ChartJS.register(ArcElement, PieController, Tooltip);

// Each player gets one base hue (spec's example: green vs purple), shaded
// per category so individual slices stay distinguishable within a
// player's own pie. The two pies are absolutely-positioned on top of each
// other at reduced alpha with mix-blend-mode: screen (lightens overlap
// regions, reads well against the black theme) to produce the
// "layered/overlaid" comparison the spec describes.
const PLAYER_A_SHADES = [
  "#14532d", "#166534", "#15803d", "#16a34a", "#22c55e",
  "#4ade80", "#86efac", "#bbf7d0", "#dcfce7",
];
const PLAYER_B_SHADES = [
  "#4c1d95", "#5b21b6", "#6d28d9", "#7c3aed", "#8b5cf6",
  "#a78bfa", "#c4b5fd", "#ddd6fe", "#ede9fe",
];

const SIZE = 320;
const ALPHA = "cc"; // ~80% opacity, hex alpha suffix

function chartData(player: PlayerRow, shades: string[]) {
  const stats = toPieData(player);
  return {
    labels: stats.map((s) => s.label),
    datasets: [
      {
        data: stats.map((s) => s.value),
        backgroundColor: shades.map((c) => c + ALPHA),
        borderColor: "#0a0a0a",
        borderWidth: 1,
      },
    ],
  };
}

const baseOptions = {
  responsive: false,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label: (ctx: { label?: string; raw: unknown }) => `${ctx.label}: ${Number(ctx.raw).toFixed(1)}`,
      },
    },
  },
} as const;

export default function OverlappingPieChart({
  playerA,
  playerB,
}: {
  playerA: PlayerRow;
  playerB: PlayerRow;
}) {
  return (
    <div>
      <div style={{ position: "relative", width: SIZE, height: SIZE, margin: "0 auto" }}>
        <div style={{ position: "absolute", inset: 0, mixBlendMode: "screen" }}>
          <Pie data={chartData(playerA, PLAYER_A_SHADES)} width={SIZE} height={SIZE} options={baseOptions} />
        </div>
        <div style={{ position: "absolute", inset: 0, mixBlendMode: "screen" }}>
          <Pie data={chartData(playerB, PLAYER_B_SHADES)} width={SIZE} height={SIZE} options={baseOptions} />
        </div>
      </div>
      <div className="flex justify-center gap-6 mt-3 text-sm">
        <span className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: PLAYER_A_SHADES[4] }} />
          {playerA.full_name}
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: PLAYER_B_SHADES[4] }} />
          {playerB.full_name}
        </span>
      </div>
      <p className="text-center text-xs text-foreground/40 mt-2">
        {toPieData(playerA).map((s) => s.label).join(" · ")}
      </p>
    </div>
  );
}
