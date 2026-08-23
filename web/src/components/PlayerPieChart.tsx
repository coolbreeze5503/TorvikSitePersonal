"use client";

import { Chart as ChartJS, ArcElement, PieController, Tooltip, Legend } from "chart.js";
import { Pie } from "react-chartjs-2";
import { PlayerRow } from "@/lib/player-types";
import { toPieData } from "@/lib/pie-stats";

ChartJS.register(ArcElement, PieController, Tooltip, Legend);

const SLICE_COLORS = [
  "#dc2626", "#f87171", "#fca5a5", "#7f1d1d", "#ef4444",
  "#b91c1c", "#fecaca", "#991b1b", "#fb7185",
];

export default function PlayerPieChart({ player }: { player: PlayerRow }) {
  const stats = toPieData(player);

  const data = {
    labels: stats.map((s) => s.label),
    datasets: [
      {
        data: stats.map((s) => s.value),
        backgroundColor: SLICE_COLORS,
        borderColor: "#0a0a0a",
        borderWidth: 2,
      },
    ],
  };

  return (
    <div style={{ width: 320, height: 360, margin: "0 auto" }}>
      <Pie
        data={data}
        width={320}
        height={360}
        options={{
          responsive: false,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: "bottom",
              labels: { color: "#f2f2f2", boxWidth: 12, font: { size: 11 } },
            },
            tooltip: {
              callbacks: {
                label: (ctx) => `${ctx.label}: ${Number(ctx.raw).toFixed(1)}`,
              },
            },
          },
        }}
      />
    </div>
  );
}
