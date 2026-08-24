"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { CURRENT_SEASON, FORECAST_SEASON, parseSeason } from "@/lib/types";

export default function SeasonToggle() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const season = parseSeason(searchParams.get("season") ?? undefined);

  function setSeason(next: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === CURRENT_SEASON) {
      params.delete("season");
    } else {
      params.set("season", String(next));
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="inline-flex border border-border rounded overflow-hidden text-xs font-semibold">
      <button
        type="button"
        onClick={() => setSeason(CURRENT_SEASON)}
        className={`px-3 py-1.5 transition-colors ${
          season === CURRENT_SEASON
            ? "bg-accent-dim text-white"
            : "text-foreground/60 hover:text-foreground"
        }`}
      >
        Current
      </button>
      <button
        type="button"
        onClick={() => setSeason(FORECAST_SEASON)}
        className={`px-3 py-1.5 transition-colors border-l border-border ${
          season === FORECAST_SEASON
            ? "bg-accent-dim text-white"
            : "text-foreground/60 hover:text-foreground"
        }`}
      >
        {FORECAST_SEASON} Forecast
      </button>
    </div>
  );
}
