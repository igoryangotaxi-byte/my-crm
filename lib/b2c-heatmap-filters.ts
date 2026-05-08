import {
  getJerusalemWallFromUtcMs,
  jerusalemDateRangeToUtcBounds,
  wallDateKey,
} from "@/lib/jerusalem-wall-time";

export type HeatmapTimeMode = "day24" | "week" | "month";

const WEEKDAY_TO_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

type HeatmapPoint = { lat: number; lon: number; ts: number };

const WEEKDAY_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Jerusalem",
  weekday: "short",
});

function weekHourIndexFromTs(ts: number): number {
  const wd = WEEKDAY_FORMATTER.format(new Date(ts));
  const wall = getJerusalemWallFromUtcMs(ts);
  const hour = wall.h;
  const dow = WEEKDAY_TO_INDEX[wd] ?? 0;
  return dow * 24 + hour;
}

export function maxSliderIndex(mode: HeatmapTimeMode, fromYmd: string, toYmd: string): number {
  if (mode === "day24") return 23;
  if (mode === "week") return 167;
  const bounds = jerusalemDateRangeToUtcBounds(fromYmd, toYmd);
  if (!bounds) return 0;
  const hours = Math.ceil((bounds.toExclusiveMs - bounds.fromMs) / 3_600_000);
  return Math.max(0, Math.min(744, hours) - 1);
}

export function filterPointsBySlider(
  points: HeatmapPoint[],
  mode: HeatmapTimeMode,
  sliderIndex: number,
  fromYmd: string,
  toYmd: string,
): HeatmapPoint[] {
  if (mode === "day24") {
    return points.filter((p) => {
      const w = getJerusalemWallFromUtcMs(p.ts);
      return w.h === sliderIndex;
    });
  }
  if (mode === "week") {
    return points.filter((p) => weekHourIndexFromTs(p.ts) === sliderIndex);
  }
  const bounds = jerusalemDateRangeToUtcBounds(fromYmd, toYmd);
  if (!bounds) return [];
  const start = bounds.fromMs + sliderIndex * 3_600_000;
  const end = start + 3_600_000;
  return points.filter((p) => p.ts >= start && p.ts < end);
}

export function buildHeatmapBuckets(
  points: HeatmapPoint[],
  mode: HeatmapTimeMode,
  fromYmd: string,
  toYmd: string,
): HeatmapPoint[][] {
  const maxIndex = maxSliderIndex(mode, fromYmd, toYmd);
  const buckets = Array.from({ length: maxIndex + 1 }, () => [] as HeatmapPoint[]);
  if (points.length === 0) return buckets;

  if (mode === "day24") {
    for (const p of points) {
      const h = getJerusalemWallFromUtcMs(p.ts).h;
      if (h >= 0 && h < buckets.length) buckets[h]!.push(p);
    }
    return buckets;
  }

  if (mode === "week") {
    for (const p of points) {
      const idx = weekHourIndexFromTs(p.ts);
      if (idx >= 0 && idx < buckets.length) buckets[idx]!.push(p);
    }
    return buckets;
  }

  const bounds = jerusalemDateRangeToUtcBounds(fromYmd, toYmd);
  if (!bounds) return buckets;
  const fromMs = bounds.fromMs;
  for (const p of points) {
    const idx = Math.floor((p.ts - fromMs) / 3_600_000);
    if (idx >= 0 && idx < buckets.length) buckets[idx]!.push(p);
  }
  return buckets;
}

export function sliderLabel(
  mode: HeatmapTimeMode,
  sliderIndex: number,
  fromYmd: string,
  toYmd: string,
): string {
  if (mode === "day24") {
    return `Hour ${String(sliderIndex).padStart(2, "0")}:00–${String(sliderIndex).padStart(2, "0")}:59 (Asia/Jerusalem)`;
  }
  if (mode === "week") {
    const dow = Math.floor(sliderIndex / 24);
    const h = sliderIndex % 24;
    const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return `${names[dow] ?? "?"} ${String(h).padStart(2, "0")}:00 (Asia/Jerusalem)`;
  }
  const bounds = jerusalemDateRangeToUtcBounds(fromYmd, toYmd);
  if (!bounds) return `Slot ${sliderIndex}`;
  const ms = bounds.fromMs + sliderIndex * 3_600_000;
  const w = getJerusalemWallFromUtcMs(ms);
  return `${wallDateKey(w)} ${String(w.h).padStart(2, "0")}:${String(w.mi).padStart(2, "0")} (Asia/Jerusalem)`;
}
