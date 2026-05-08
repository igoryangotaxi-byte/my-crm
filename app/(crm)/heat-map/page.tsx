"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { DemandHeatMap } from "@/components/b2c-heatmap/DemandHeatMap";
import {
  buildHeatmapBuckets,
  maxSliderIndex,
  sliderLabel,
  type HeatmapTimeMode,
} from "@/lib/b2c-heatmap-filters";
import { jerusalemDateRangeToUtcBounds } from "@/lib/jerusalem-wall-time";
import { useTranslations } from "next-intl";

type TripPoint = { lat: number; lon: number; ts: number };

type MetaResponse = {
  ok?: boolean;
  minDate?: string | null;
  maxDate?: string | null;
  totalRows?: number;
};

type TripsResponse = {
  ok?: boolean;
  points?: TripPoint[];
  error?: string;
  returned?: number;
};

type BranchPoint = {
  name: string;
  address: string;
  lon: number;
  lat: number;
};

function addDaysYmd(ymd: string, deltaDays: number): string {
  const m = ymd.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return ymd;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const u = Date.UTC(y, mo - 1, d + deltaDays);
  const dt = new Date(u);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function clampYmd(value: string, min: string, max: string): string {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === "\"") {
      if (inQuotes && line[i + 1] === "\"") {
        current += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

function parseBranchesCsv(raw: string): BranchPoint[] {
  const lines = raw
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const out: BranchPoint[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const cells = parseCsvLine(lines[i]!);
    if (cells.length < 4) continue;
    const [nameRaw, addressRaw, lonRaw, latRaw] = cells;
    const lon = Number((lonRaw ?? "").replace(",", "."));
    const lat = Number((latRaw ?? "").replace(",", "."));
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
      if (i === 0) continue; // header row
      continue;
    }
    out.push({
      name: (nameRaw ?? "").trim() || "Branch",
      address: (addressRaw ?? "").trim() || "",
      lon,
      lat,
    });
  }
  return out;
}

export default function HeatMapPage() {
  const t = useTranslations("heatMapPage");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [boundsMin, setBoundsMin] = useState<string | null>(null);
  const [boundsMax, setBoundsMax] = useState<string | null>(null);
  const [datasetTotalRows, setDatasetTotalRows] = useState<number | null>(null);
  const [lastReturned, setLastReturned] = useState<number | null>(null);
  const [mapFitNonce, setMapFitNonce] = useState(0);
  const [mode, setMode] = useState<HeatmapTimeMode>("day24");
  const [slider, setSlider] = useState(0);
  const [allPoints, setAllPoints] = useState<TripPoint[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loadingTrips, setLoadingTrips] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [branchPoints, setBranchPoints] = useState<BranchPoint[]>([]);
  const [branchUploadError, setBranchUploadError] = useState<string | null>(null);

  const [mapPointsForMap, setMapPointsForMap] = useState<Array<{ lat: number; lon: number }>>([]);
  const mapPointsRafRef = useRef<number | null>(null);
  const branchesInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/b2c-heatmap/trips?meta=1", { cache: "no-store" });
        const data = (await res.json()) as MetaResponse;
        if (cancelled) return;
        if (!res.ok || !data.ok) {
          setError(t("metaError"));
          setFrom("");
          setTo("");
          setDatasetTotalRows(null);
          return;
        }
        const minD = data.minDate ?? null;
        const maxD = data.maxDate ?? null;
        setBoundsMin(minD);
        setBoundsMax(maxD);
        setDatasetTotalRows(typeof data.totalRows === "number" ? data.totalRows : null);
        if (minD && maxD) {
          const spanStart = addDaysYmd(maxD, -13);
          const fromInit = spanStart < minD ? minD : spanStart;
          setFrom(fromInit);
          setTo(maxD);
          setError(null);
        } else {
          setFrom("");
          setTo("");
        }
      } catch {
        if (!cancelled) setError(t("metaError"));
      } finally {
        if (!cancelled) setLoadingMeta(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  const loadTrips = useCallback(async () => {
    if (!from || !to || from > to) {
      setAllPoints([]);
      setLastReturned(null);
      return;
    }
    setLoadingTrips(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ from, to });
      const res = await fetch(`/api/b2c-heatmap/trips?${qs}`, { cache: "no-store" });
      const data = (await res.json()) as TripsResponse;
      if (!res.ok || !data.ok) {
        setError(data.error ?? t("tripsError"));
        setAllPoints([]);
        setLastReturned(null);
        return;
      }
      setAllPoints(data.points ?? []);
      setLastReturned(typeof data.returned === "number" ? data.returned : (data.points?.length ?? null));
    } catch {
      setError(t("tripsError"));
      setAllPoints([]);
      setLastReturned(null);
    } finally {
      setLoadingTrips(false);
    }
  }, [from, to, t]);

  useEffect(() => {
    void loadTrips();
  }, [loadTrips]);

  const sMax = useMemo(() => maxSliderIndex(mode, from, to), [mode, from, to]);

  useEffect(() => {
    setSlider((s) => Math.min(s, sMax));
  }, [sMax, mode, from, to]);

  const buckets = useMemo(() => buildHeatmapBuckets(allPoints, mode, from, to), [allPoints, mode, from, to]);
  const safeSlider = Math.max(0, Math.min(slider, sMax));
  const filtered = useMemo(() => buckets[safeSlider] ?? [], [buckets, safeSlider]);

  const mapPoints = useMemo(() => filtered.map((p) => ({ lat: p.lat, lon: p.lon })), [filtered]);

  useEffect(() => {
    if (mapPointsRafRef.current != null) {
      cancelAnimationFrame(mapPointsRafRef.current);
    }
    mapPointsRafRef.current = requestAnimationFrame(() => {
      mapPointsRafRef.current = null;
      setMapPointsForMap(mapPoints);
    });
    return () => {
      if (mapPointsRafRef.current != null) {
        cancelAnimationFrame(mapPointsRafRef.current);
        mapPointsRafRef.current = null;
      }
    };
  }, [mapPoints]);

  const slotLabel = useMemo(
    () => sliderLabel(mode, safeSlider, from, to),
    [mode, safeSlider, from, to],
  );

  const cameraFitKey = `${from}:${to}:${mapFitNonce}`;

  const applyPreset = (kind: "full" | "14" | "7") => {
    if (!boundsMin || !boundsMax) return;
    if (kind === "full") {
      setFrom(boundsMin);
      setTo(boundsMax);
      return;
    }
    const end = boundsMax;
    const start = kind === "7" ? addDaysYmd(end, -6) : addDaysYmd(end, -13);
    const fromNext = start < boundsMin ? boundsMin : start;
    setFrom(fromNext);
    setTo(end);
  };

  const onFromChange = (v: string) => {
    if (!boundsMin || !boundsMax) {
      setFrom(v);
      return;
    }
    const nextFrom = clampYmd(v, boundsMin, boundsMax);
    setFrom(nextFrom);
    if (to && nextFrom > to) {
      setTo(nextFrom);
    }
  };

  const onToChange = (v: string) => {
    if (!boundsMin || !boundsMax) {
      setTo(v);
      return;
    }
    const nextTo = clampYmd(v, boundsMin, boundsMax);
    setTo(nextTo);
    if (from && nextTo < from) {
      setFrom(nextTo);
    }
  };

  const monthHourCap =
    mode === "month" &&
    (() => {
      const b = jerusalemDateRangeToUtcBounds(from, to);
      if (!b) return false;
      const h = Math.ceil((b.toExclusiveMs - b.fromMs) / 3_600_000);
      return h > 744;
    })();

  const sampleInfo =
    datasetTotalRows != null && lastReturned != null
      ? t("sampleInfo", { returned: lastReturned, total: datasetTotalRows })
      : null;

  const handleBranchesFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setBranchUploadError(null);
    try {
      const text = await file.text();
      const parsed = parseBranchesCsv(text);
      if (parsed.length === 0) {
        setBranchUploadError("No valid branch rows found in CSV.");
        setBranchPoints([]);
      } else {
        setBranchPoints(parsed);
      }
    } catch {
      setBranchUploadError("Failed to parse branch CSV.");
      setBranchPoints([]);
    } finally {
      event.target.value = "";
    }
  };

  const isPresetActive = (kind: "full" | "14" | "7"): boolean => {
    if (!boundsMin || !boundsMax || !from || !to) return false;
    if (kind === "full") return from === boundsMin && to === boundsMax;
    if (kind === "14") {
      const start = addDaysYmd(boundsMax, -13);
      const expectedFrom = start < boundsMin ? boundsMin : start;
      return from === expectedFrom && to === boundsMax;
    }
    const start = addDaysYmd(boundsMax, -6);
    const expectedFrom = start < boundsMin ? boundsMin : start;
    return from === expectedFrom && to === boundsMax;
  };

  const chipBaseClass =
    "crm-hover-lift rounded-full border px-3 py-1.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/70 disabled:cursor-not-allowed disabled:opacity-40";
  const chipInactiveClass = "border-white/70 bg-white/90 text-slate-700 hover:bg-white active:scale-[0.98]";
  const chipActiveClass = "border-red-200 bg-red-50 text-red-800 shadow-[0_10px_18px_rgba(239,68,68,0.16)]";
  const secondaryButtonClass =
    "crm-hover-lift h-10 rounded-xl border border-white/70 bg-white/90 px-4 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-white active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/70 disabled:opacity-40";
  const panelWrapClass =
    "rr-glass-column-shell pointer-events-auto flex w-full max-w-[min(36rem,calc(100vw-1.5rem))] flex-col overflow-x-hidden rounded-3xl p-3 lg:p-4";
  const panelBodyClass = "space-y-4 overflow-y-auto overflow-x-hidden pb-3";

  return (
    <section className="relative flex min-h-0 flex-1 flex-col gap-0 overflow-visible">
      <div className="relative min-h-0 flex-1 w-full overflow-visible">
        <div className="fixed inset-0 z-0 bg-gradient-to-br from-gray-100 via-gray-50 to-gray-100">
          <DemandHeatMap points={mapPointsForMap} branches={branchPoints} cameraFitKey={cameraFitKey} />
        </div>

        <div className="pointer-events-none absolute inset-0 z-40 pb-4 pt-[calc(5.25rem-50px)] pl-[calc(0.75rem+4rem+1.25rem-50px)] pr-3 lg:pt-[calc(5.5rem-50px)] lg:pl-[calc(0.75rem+4rem+1.5rem-50px)] lg:pr-4">
          <div className={panelWrapClass}>
            <div className={`${panelBodyClass} max-h-[calc(100dvh-7rem)] lg:max-h-[calc(100dvh-7.5rem)]`}>
              <div className="rounded-3xl border border-white/80 bg-white/88 p-4 shadow-lg backdrop-blur-xl">
                <h2 className="text-base font-semibold text-slate-900">{t("controlsTitle")}</h2>
                <p className="mt-1 text-xs text-slate-600">{t("dateHint")}</p>
                {sampleInfo ? <p className="mt-1 text-[11px] text-slate-500">{sampleInfo}</p> : null}

                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <label className="flex flex-col gap-1 text-xs font-medium text-slate-700">
                    {t("from")}
                    <input
                      type="date"
                      className="crm-input h-10 rounded-xl px-2 text-sm transition-[border-color,box-shadow,transform] duration-150 hover:border-red-200/80 active:scale-[0.995]"
                      value={from}
                      min={boundsMin ?? undefined}
                      max={boundsMax ?? undefined}
                      disabled={loadingMeta}
                      onChange={(e) => onFromChange(e.target.value)}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-medium text-slate-700">
                    {t("to")}
                    <input
                      type="date"
                      className="crm-input h-10 rounded-xl px-2 text-sm transition-[border-color,box-shadow,transform] duration-150 hover:border-red-200/80 active:scale-[0.995]"
                      value={to}
                      min={boundsMin ?? undefined}
                      max={boundsMax ?? undefined}
                      disabled={loadingMeta}
                      onChange={(e) => onToChange(e.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => branchesInputRef.current?.click()}
                    className="crm-button-primary h-10 rounded-xl px-4 text-sm"
                    title="CSV format: A=Store name, B=Address, C=Longitude, D=Latitude"
                    aria-label="Add Branches CSV (A Store name, B Address, C Longitude, D Latitude)"
                  >
                    Add Branches
                  </button>
                  <input
                    ref={branchesInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(event) => void handleBranchesFileChange(event)}
                  />
                  {branchPoints.length > 0 ? (
                    <p className="rounded-lg border border-white/80 bg-white/90 px-2.5 py-1 text-[11px] text-slate-700 shadow-sm">
                      Loaded branches: {branchPoints.length}
                    </p>
                  ) : null}
                </div>
                {branchUploadError ? (
                  <p className="mt-2 max-w-[22rem] rounded-lg border border-rose-200 bg-rose-50/95 px-2.5 py-1 text-[11px] text-rose-700 shadow-sm">
                    {branchUploadError}
                  </p>
                ) : null}

                <div className="mt-3 space-y-2 rounded-2xl border border-slate-200/80 bg-white/90 p-3 shadow-sm">
                  <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    {t("scaleLabel")}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={!boundsMin || !boundsMax || loadingMeta}
                      onClick={() => applyPreset("full")}
                      className={`${chipBaseClass} ${isPresetActive("full") ? chipActiveClass : chipInactiveClass}`}
                    >
                      {t("presetFull")}
                    </button>
                    <button
                      type="button"
                      disabled={!boundsMin || !boundsMax || loadingMeta}
                      onClick={() => applyPreset("14")}
                      className={`${chipBaseClass} ${isPresetActive("14") ? chipActiveClass : chipInactiveClass}`}
                    >
                      {t("preset14d")}
                    </button>
                    <button
                      type="button"
                      disabled={!boundsMin || !boundsMax || loadingMeta}
                      onClick={() => applyPreset("7")}
                      className={`${chipBaseClass} ${isPresetActive("7") ? chipActiveClass : chipInactiveClass}`}
                    >
                      {t("preset7d")}
                    </button>
                  </div>
                </div>

                <div className="mt-3 space-y-2 rounded-2xl border border-slate-200/80 bg-white/90 p-3 shadow-sm">
                  <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    {t("granularityLabel")}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {(["day24", "week", "month"] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => {
                          setMode(m);
                          setSlider(0);
                        }}
                        className={`${chipBaseClass} ${mode === m ? chipActiveClass : chipInactiveClass}`}
                      >
                        {m === "day24" ? t("mode24h") : m === "week" ? t("modeWeek") : t("modeMonth")}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void loadTrips()}
                    disabled={loadingTrips || !from || !to}
                    className="crm-button-primary h-10 rounded-xl px-4 text-sm disabled:opacity-50"
                  >
                    {loadingTrips ? t("loading") : t("reload")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMapFitNonce((n) => n + 1)}
                    disabled={!from || !to || mapPointsForMap.length === 0}
                    className={secondaryButtonClass}
                  >
                    {t("fitMap")}
                  </button>
                </div>

                <div className="mt-4 space-y-1">
                  <label className="flex flex-col gap-1 text-xs font-medium text-slate-700">
                    {t("timeSlot")}
                    <input
                      type="range"
                      min={0}
                      max={sMax}
                      value={safeSlider}
                      onChange={(e) => setSlider(Number(e.target.value))}
                      className="w-full accent-red-600"
                    />
                  </label>
                  <p className="text-xs text-slate-700">
                    <span className="font-medium">{slotLabel}</span>
                    {" · "}
                    <span className="text-slate-600">{t("pointCount", { count: filtered.length })}</span>
                  </p>
                  {monthHourCap ? <p className="text-[11px] text-amber-800">{t("monthRangeCap")}</p> : null}
                </div>

                {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
                {loadingMeta ? <p className="mt-2 text-xs text-slate-500">{t("loadingMeta")}</p> : null}
              </div>
            </div>
          </div>
        </div>

        {allPoints.length > 0 && filtered.length === 0 && !loadingTrips ? (
          <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center px-4">
            <p className="rounded-2xl border border-white/80 bg-white/90 px-4 py-3 text-center text-sm text-slate-700 shadow-lg backdrop-blur-sm">
              {t("emptySlot")}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
