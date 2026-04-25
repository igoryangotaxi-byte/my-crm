"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DriversMap } from "@/components/drivers-map/DriversMap";
import type {
  DriverGeoDebugEvent,
  FleetPartnerRef,
  DriverMapItem,
  DriverMapStatus,
  DriverStatusHistoryEvent,
  DriversMapResponse,
} from "@/types/crm";

const STATUS_POLL_INTERVAL_MS = 15000;
const GEO_POLL_INTERVAL_MS = 60000;
const FORCE_REFRESH_COOLDOWN_MS = 15000;

type StatusFilter = "none" | DriverMapStatus;

/** Для маркеров lat/lon гарантированно числа; `DriverMapItem` допускает null — отдельный предикат для `filter`. */
type DriverMapItemWithCoords = DriverMapItem & { lat: number; lon: number };

function statusLabel(status: DriverMapStatus): string {
  if (status === "available") return "Available";
  if (status === "active_trip") return "Active trip";
  if (status === "busy") return "Busy";
  return "No GPS";
}

function statusDotClass(status: DriverMapStatus): string {
  if (status === "available") return "bg-emerald-500";
  if (status === "active_trip") return "bg-amber-500";
  if (status === "busy") return "bg-orange-500";
  return "bg-slate-400";
}

function statusCardClass(status: DriverMapStatus): string {
  if (status === "available") return "border-emerald-200 bg-emerald-50/80";
  if (status === "active_trip") return "border-amber-200 bg-amber-50/80";
  if (status === "busy") return "border-rose-200 bg-rose-50/80";
  return "border-slate-200 bg-slate-50/80";
}

function parseCoordinate(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normIdentityPart(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function driverGeoIdentity(driver: Pick<DriverMapItem, "phone" | "carNumber" | "callsign" | "name">): string {
  return [
    normIdentityPart(driver.phone),
    normIdentityPart(driver.carNumber),
    normIdentityPart(driver.callsign),
    normIdentityPart(driver.name),
  ].join("|");
}

function hasMeaningfulIdentityKey(key: string): boolean {
  return key.split("|").some((part) => part.length > 0);
}

export default function DriversMapPage() {
  const [drivers, setDrivers] = useState<DriverMapItem[]>([]);
  const [partners, setPartners] = useState<FleetPartnerRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("none");
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [driverGeoDebug, setDriverGeoDebug] = useState<Record<string, DriverGeoDebugEvent[]>>({});
  const [showPartnerDropdown, setShowPartnerDropdown] = useState(false);
  const [selectedPartnerKey, setSelectedPartnerKey] = useState("");
  const geoByDriverRef = useRef<Map<string, { lat: number | null; lon: number | null; lastTrackedAt: string | null }>>(
    new Map(),
  );
  const geoByIdentityRef = useRef<Map<string, { lat: number | null; lon: number | null; lastTrackedAt: string | null }>>(
    new Map(),
  );
  const lastOkDriversRef = useRef<DriverMapItem[]>([]);
  const loadMutexRef = useRef<Promise<unknown>>(Promise.resolve());
  const [nextStatusUpdateAtMs, setNextStatusUpdateAtMs] = useState<number>(0);
  const [nextGeoUpdateAtMs, setNextGeoUpdateAtMs] = useState<number>(0);
  const [nowMs, setNowMs] = useState<number>(0);
  const [nextForceRefreshAtMs, setNextForceRefreshAtMs] = useState<number>(0);
  const [forceRefreshing, setForceRefreshing] = useState(false);

  const load = useCallback(async (includeGeo: boolean, force = false): Promise<{ rateLimited: boolean }> => {
    const next = loadMutexRef.current.then(async () => {
      try {
        const response = await fetch(
          `/api/drivers-map?includeGeo=${includeGeo ? "1" : "0"}${force ? "&force=1" : ""}&debug=1`,
          {
            cache: "no-store",
          },
        );
        let payload: DriversMapResponse;
        try {
          payload = (await response.json()) as DriversMapResponse;
        } catch {
          throw new Error("Invalid JSON from /api/drivers-map (server or proxy error).");
        }
        if (!response.ok || !payload.ok) {
          throw new Error(payload.message ?? `HTTP ${response.status}`);
        }
        const incoming = payload.drivers ?? [];
        for (const item of incoming) {
          const identity = driverGeoIdentity(item);
          const prevById = geoByDriverRef.current.get(item.id);
          const prevByIdentity = geoByIdentityRef.current.get(identity);
          const prev = prevById ?? prevByIdentity ?? null;
          const parsedLat = parseCoordinate(item.lat);
          const parsedLon = parseCoordinate(item.lon);
          const hasNewGps = parsedLat != null && parsedLon != null;
          /** Держим последнюю известную точку и по id, и по identity — id у Fleet может дрейфовать между циклами. */
          const lat = hasNewGps ? parsedLat : (prev?.lat ?? null);
          const lon = hasNewGps ? parsedLon : (prev?.lon ?? null);
          const lastTrackedAt = hasNewGps
            ? (item.lastTrackedAt ?? null)
            : (prev?.lastTrackedAt ?? item.lastTrackedAt ?? null);
          const nextGeo = { lat, lon, lastTrackedAt };
          geoByDriverRef.current.set(item.id, nextGeo);
          if (hasMeaningfulIdentityKey(identity)) {
            geoByIdentityRef.current.set(identity, nextGeo);
          }
        }
        const merged = incoming.map((item) => {
          const identity = driverGeoIdentity(item);
          const geo = geoByDriverRef.current.get(item.id) ?? geoByIdentityRef.current.get(identity);
          if (!geo) return item;
          return {
            ...item,
            lat: geo.lat,
            lon: geo.lon,
            lastTrackedAt: geo.lastTrackedAt,
          };
        });
        if (merged.length > 0) {
          lastOkDriversRef.current = merged;
        }
        setDrivers(merged.length > 0 ? merged : lastOkDriversRef.current);
        setDriverGeoDebug(payload.driverGeoDebug ?? {});
        setServerMessage(payload.message ?? null);
        setError(null);
        const rateLimited = (payload.message ?? "").toLowerCase().includes("rate limit");
        return { rateLimited };
      } catch (e) {
        const message = e instanceof Error ? e.message : "Failed to load drivers map data.";
        setError(message);
        if (lastOkDriversRef.current.length > 0) {
          setDrivers(lastOkDriversRef.current);
        }
        return { rateLimited: message.toLowerCase().includes("429") };
      } finally {
        setLoading(false);
      }
    });
    loadMutexRef.current = next.catch(() => undefined);
    return next as Promise<{ rateLimited: boolean }>;
  }, []);

  const applyStatusFilter = useCallback((next: StatusFilter) => {
    setStatusFilter(next);
    setSelectedDriverId(null);
  }, []);

  const canForceRefresh = nowMs >= nextForceRefreshAtMs && !forceRefreshing;
  const forceRefreshCountdownSec = Math.max(0, Math.ceil((nextForceRefreshAtMs - nowMs) / 1000));
  const handleForceRefresh = useCallback(async () => {
    if (!canForceRefresh) return;
    setForceRefreshing(true);
    try {
      const baseNow = Date.now();
      await load(true, true);
      setNextForceRefreshAtMs(baseNow + FORCE_REFRESH_COOLDOWN_MS);
      setNextStatusUpdateAtMs(baseNow + STATUS_POLL_INTERVAL_MS);
      setNextGeoUpdateAtMs(baseNow + GEO_POLL_INTERVAL_MS);
      setNowMs(baseNow);
    } finally {
      setForceRefreshing(false);
    }
  }, [canForceRefresh, load]);

  useEffect(() => {
    const initializeTimer = window.setTimeout(() => {
      const baseNow = Date.now();
      setNextStatusUpdateAtMs(baseNow + STATUS_POLL_INTERVAL_MS);
      setNextGeoUpdateAtMs(baseNow + GEO_POLL_INTERVAL_MS);
      setNowMs(baseNow);
      void load(true);
    }, 0);
    const statusTimer = window.setInterval(() => {
      void load(false);
      setNextStatusUpdateAtMs(Date.now() + STATUS_POLL_INTERVAL_MS);
    }, STATUS_POLL_INTERVAL_MS);
    const geoTimer = window.setInterval(() => {
      void load(true);
      setNextGeoUpdateAtMs(Date.now() + GEO_POLL_INTERVAL_MS);
    }, GEO_POLL_INTERVAL_MS);
    return () => {
      window.clearTimeout(initializeTimer);
      window.clearInterval(statusTimer);
      window.clearInterval(geoTimer);
    };
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/fleet-partners", { cache: "no-store" });
        const payload = (await response.json()) as {
          ok?: boolean;
          partners?: FleetPartnerRef[];
        };
        if (!response.ok || !payload.ok) return;
        if (!cancelled) {
          setPartners(payload.partners ?? []);
        }
      } catch {
        // Keep page functional even when partner list is unavailable.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const counters = useMemo(() => {
    let available = 0;
    let activeTrip = 0;
    let busy = 0;
    let noGps = 0;
    for (const driver of drivers) {
      if (driver.status === "available") available += 1;
      if (driver.status === "active_trip") activeTrip += 1;
      if (driver.status === "busy") busy += 1;
      if (driver.status === "no_gps") noGps += 1;
    }
    return { available, activeTrip, busy, noGps };
  }, [drivers]);

  const filteredDrivers = useMemo(() => {
    return drivers.filter((driver) => {
      if (selectedPartnerKey && (driver.partnerId ?? "") !== selectedPartnerKey) return false;
      if (statusFilter === "none") return true;
      if (driver.status !== statusFilter) return false;
      return true;
    });
  }, [drivers, statusFilter, selectedPartnerKey]);

  const latestGeoByIdentity = useMemo(() => {
    const out = new Map<string, { lat: number; lon: number; lastTrackedAt: string | null }>();
    for (const driver of drivers) {
      const id = driverGeoIdentity(driver);
      if (!hasMeaningfulIdentityKey(id)) continue;
      const lat = parseCoordinate(driver.lat);
      const lon = parseCoordinate(driver.lon);
      if (lat == null || lon == null) continue;
      out.set(id, { lat, lon, lastTrackedAt: driver.lastTrackedAt ?? null });
    }
    return out;
  }, [drivers]);

  const selectedDriver = useMemo(
    () => drivers.find((driver) => driver.id === selectedDriverId) ?? null,
    [drivers, selectedDriverId],
  );

  const statusHistory = useMemo<DriverStatusHistoryEvent[]>(
    () => selectedDriver?.statusHistory24h ?? [],
    [selectedDriver],
  );

  const selectedPartner = useMemo(
    () => partners.find((item) => item.id === selectedPartnerKey) ?? null,
    [partners, selectedPartnerKey],
  );

  const statusBubbleClass = (selected: boolean) =>
    selected
      ? "crm-button-primary text-white"
      : "border border-white/70 bg-white/85 text-slate-700 hover:bg-white";

  const formatHistoryTime = (iso: string): string => {
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return "n/a";
    return new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Jerusalem",
    }).format(dt);
  };

  /** Маркеры соответствуют выбранному статусу/партнёру и используют последнюю известную гео. */
  const mapDrivers = useMemo(() => {
    return filteredDrivers
      .map((driver) => {
        const lat = parseCoordinate(driver.lat);
        const lon = parseCoordinate(driver.lon);
        if (lat != null && lon != null) {
          return { ...driver, lat, lon };
        }
        const identity = driverGeoIdentity(driver);
        const cachedGeo = latestGeoByIdentity.get(identity);
        if (cachedGeo) {
          return {
            ...driver,
            lat: cachedGeo.lat,
            lon: cachedGeo.lon,
            lastTrackedAt: driver.lastTrackedAt ?? cachedGeo.lastTrackedAt ?? null,
          };
        }
        const events = driverGeoDebug[driver.id] ?? [];
        for (let i = events.length - 1; i >= 0; i -= 1) {
          const ev = events[i];
          const evLat = parseCoordinate(ev.lat);
          const evLon = parseCoordinate(ev.lon);
          if (evLat != null && evLon != null) {
            return {
              ...driver,
              lat: evLat,
              lon: evLon,
              lastTrackedAt: driver.lastTrackedAt ?? ev.at,
            };
          }
        }
        return null;
      })
      .filter((driver): driver is DriverMapItemWithCoords => driver != null);
  }, [driverGeoDebug, filteredDrivers, latestGeoByIdentity]);

  const gpsLostDriverIds = useMemo(() => {
    const out = new Set<string>();
    for (const driver of mapDrivers) {
      const events = driverGeoDebug[driver.id] ?? [];
      const last = events[events.length - 1];
      if (!last) continue;
      if (last.source === "carry" || last.source === "missing") {
        out.add(driver.id);
      }
    }
    return [...out];
  }, [driverGeoDebug, mapDrivers]);

  const gpsVisibleCount = mapDrivers.length;
  const mapDebugIds = useMemo(() => mapDrivers.slice(0, 10).map((d) => d.id), [mapDrivers]);
  const geoDebugSummary = useMemo(() => {
    const base = { track: 0, profile: 0, carry: 0, missing: 0 };
    for (const driver of filteredDrivers) {
      const events = driverGeoDebug[driver.id] ?? [];
      const last = events[events.length - 1];
      if (!last) {
        base.missing += 1;
        continue;
      }
      base[last.source] += 1;
    }
    return base;
  }, [driverGeoDebug, filteredDrivers]);
  const bubbleBaseClass = "crm-hover-lift inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition";
  const statusCountdownSec = Math.max(0, Math.ceil((nextStatusUpdateAtMs - nowMs) / 1000));
  const geoCountdownSec = Math.max(0, Math.ceil((nextGeoUpdateAtMs - nowMs) / 1000));
  const hasTechnicalInfo = Boolean(serverMessage || error);

  return (
    <section className="crm-page min-h-0">
      <div className="glass-surface flex w-full min-w-0 flex-col overflow-hidden rounded-3xl border border-white/70 bg-white/80 text-slate-900">
        <div className="border-b border-border px-4 py-3">
          <h1 className="text-lg font-semibold text-slate-900">Map</h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => applyStatusFilter("available")}
              className={`${bubbleBaseClass} ${statusBubbleClass(statusFilter === "available")}`}
            >
              <span className="rounded-full bg-emerald-500 px-2.5 py-0.5 text-xs text-white">{counters.available}</span>
              Available
            </button>
            <button
              type="button"
              onClick={() => applyStatusFilter("active_trip")}
              className={`${bubbleBaseClass} ${statusBubbleClass(statusFilter === "active_trip")}`}
            >
              <span className="rounded-full bg-amber-500 px-2.5 py-0.5 text-xs text-white">{counters.activeTrip}</span>
              Active trip
            </button>
            <button
              type="button"
              onClick={() => applyStatusFilter("busy")}
              className={`${bubbleBaseClass} ${statusBubbleClass(statusFilter === "busy")}`}
            >
              <span className="rounded-full bg-rose-500 px-2.5 py-0.5 text-xs text-white">{counters.busy}</span>
              Busy
            </button>
            <button
              type="button"
              onClick={() => applyStatusFilter("no_gps")}
              className={`${bubbleBaseClass} ${statusBubbleClass(statusFilter === "no_gps")}`}
            >
              <span className="rounded-full bg-slate-500 px-2.5 py-0.5 text-xs text-white">{counters.noGps}</span>
              No GPS
            </button>
            <div className="relative min-w-[280px]">
              <button
                type="button"
                onClick={() => setShowPartnerDropdown((prev) => !prev)}
                onBlur={() => {
                  window.setTimeout(() => setShowPartnerDropdown(false), 120);
                }}
                className="crm-input flex h-12 w-full items-center justify-between rounded-2xl px-3 text-sm text-slate-700"
              >
                {selectedPartner ? (
                  <span className="min-w-0">
                    <span className="block truncate text-left text-sm font-semibold text-slate-800">
                      {selectedPartner.name}
                    </span>
                    <span className="block truncate text-left text-[10px] leading-tight text-slate-500">
                      clid: {selectedPartner.id}
                    </span>
                  </span>
                ) : (
                  <span className="truncate">Select Partner</span>
                )}
                <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 text-slate-600" stroke="currentColor" strokeWidth="1.7">
                  <path d="M5 7.5l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {showPartnerDropdown ? (
                <div className="absolute z-[90] mt-1 max-h-56 w-full overflow-auto rounded-2xl border border-white/70 bg-white/90 p-1 shadow-[0_20px_45px_rgba(15,23,42,0.18)] backdrop-blur-md">
                  {partners.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-slate-500">No API partners available</p>
                  ) : (
                    partners.map((partner) => {
                      const key = partner.id;
                      const active = selectedPartnerKey === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          onMouseDown={(event) => {
                            event.preventDefault();
                            setSelectedPartnerKey(key);
                            setShowPartnerDropdown(false);
                          }}
                          className={`crm-hover-lift w-full rounded-xl px-3 py-2 text-left hover:bg-white/95 ${
                            active ? "bg-white" : ""
                          }`}
                        >
                          <p className="text-sm font-semibold text-slate-800">{partner.name}</p>
                          <p className="text-[10px] leading-tight text-slate-600">clid: {partner.id}</p>
                        </button>
                      );
                    })
                  )}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => applyStatusFilter("none")}
              className={`crm-hover-lift inline-flex h-10 items-center rounded-full px-4 text-sm font-medium transition ${statusBubbleClass(statusFilter === "none")}`}
            >
              Reset
            </button>
          </div>
          <details className="mt-2 rounded-xl border border-slate-200/80 bg-white/70 px-3 py-2">
            <summary className="cursor-pointer list-none text-xs font-semibold text-slate-600">
              Technical details
            </summary>
            <div className="mt-2 space-y-1.5">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleForceRefresh()}
                  disabled={!canForceRefresh}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                    canForceRefresh
                      ? "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      : "cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400"
                  }`}
                >
                  {forceRefreshing ? "Refreshing..." : "Force refresh now"}
                </button>
                {!canForceRefresh ? (
                  <span className="text-[11px] text-slate-500">Next manual refresh in {forceRefreshCountdownSec}s</span>
                ) : null}
              </div>
              {!error ? (
                <p className="text-[11px] text-slate-500">
                  On map (with coordinates): {gpsVisibleCount} · In this list: {filteredDrivers.length}
                </p>
              ) : null}
              {!error ? (
                <p className="text-[11px] text-slate-500">
                  Debug map set: filtered={filteredDrivers.length} · map={mapDrivers.length}
                </p>
              ) : null}
              {!error && mapDebugIds.length > 0 ? (
                <p className="break-all text-[11px] text-slate-500">Map ids: {mapDebugIds.join(", ")}</p>
              ) : null}
              <p className="text-[11px] text-slate-500">
                Geo refresh: {Math.max(0, Math.floor(geoCountdownSec / 60))}m {geoCountdownSec % 60}s • Status
                refresh: {statusCountdownSec}s
              </p>
              <p className="text-[11px] text-slate-500">
                Geo sources (filtered): track {geoDebugSummary.track} · profile {geoDebugSummary.profile} · carry{" "}
                {geoDebugSummary.carry} · missing {geoDebugSummary.missing}
              </p>
              {serverMessage ? <p className="text-xs text-amber-700">{serverMessage}</p> : null}
              {error ? <p className="text-xs text-rose-600">{error}</p> : null}
              {!hasTechnicalInfo ? <p className="text-[11px] text-slate-500">No warnings.</p> : null}
            </div>
          </details>
        </div>

        <div className="relative h-[calc(100vh-13rem)] min-h-[min(100dvh,520px)] w-full min-w-0 overflow-hidden rounded-b-3xl">
          <div className="absolute inset-0 z-0 min-h-0 min-w-0 bg-slate-100/40">
            <DriversMap
              drivers={mapDrivers}
              selectedDriverId={selectedDriverId}
              gpsLostDriverIds={gpsLostDriverIds}
              onSelectDriver={setSelectedDriverId}
            />
          </div>

          <div className="pointer-events-none absolute left-0 top-0 z-[30] flex h-full w-full max-w-[min(100%,22rem)] flex-col p-2.5 sm:left-0 sm:max-w-sm sm:p-3">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/80 bg-white/88 shadow-[0_12px_48px_rgba(15,23,42,0.16)] backdrop-blur-md pointer-events-auto">
              <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-2.5 sm:p-3">
                {loading ? <p className="px-1 py-2 text-sm text-slate-500">Loading drivers...</p> : null}
                {!loading && filteredDrivers.length === 0 ? (
                  <p className="px-1 py-2 text-sm text-slate-500">No drivers found.</p>
                ) : null}

                {selectedDriver ? (
                  <>
                    <div className="rounded-2xl border border-white/80 bg-white/95 p-2.5 sm:p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">{selectedDriver.name}</p>
                          <p className="text-xs text-slate-600">{selectedDriver.busyLabel}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {(selectedDriver.phone ?? "n/a")} · {(selectedDriver.carNumber ?? "n/a")}
                          </p>
                        </div>
                        <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${statusDotClass(selectedDriver.status)}`} />
                      </div>
                    </div>

                    <div className="mt-2.5 rounded-2xl border border-white/80 bg-white/95 p-2.5 sm:mt-3 sm:p-3">
                      <p className="text-sm font-semibold text-slate-900">Statuses for 24h</p>
                      <div className="mt-2 space-y-1.5">
                        {statusHistory.length === 0 ? (
                          <p className="text-xs text-slate-500">No status events.</p>
                        ) : (
                          statusHistory.map((event, index) => (
                            <div
                              key={`${event.at}-${index}`}
                              className="flex items-center justify-between rounded-lg border border-slate-100 px-2 py-1.5 text-xs"
                            >
                              <span className="inline-flex items-center gap-1.5 text-slate-700">
                                <span className={`h-2 w-2 rounded-full ${statusDotClass(event.status)}`} />
                                {statusLabel(event.status)}
                              </span>
                              <span className="text-slate-500">{formatHistoryTime(event.at)}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </>
                ) : null}

                {filteredDrivers.length > 0 ? (
                  <div className={selectedDriver ? "mt-2.5 sm:mt-3" : ""}>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      All drivers ({filteredDrivers.length})
                    </p>
                    <div className="space-y-1.5">
                      {filteredDrivers.map((driver) => {
                        const selected = selectedDriverId === driver.id;
                        return (
                          <button
                            key={driver.id}
                            type="button"
                            onClick={() => setSelectedDriverId(driver.id)}
                            className={`w-full rounded-xl border px-2.5 py-2 text-left text-xs transition ${
                              selected
                                ? "border-slate-300 bg-slate-100 shadow-[0_8px_16px_rgba(15,23,42,0.10)]"
                                : `${statusCardClass(driver.status)} hover:bg-white`
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate font-semibold text-slate-800">{driver.name}</span>
                              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${statusDotClass(driver.status)}`} />
                            </div>
                            <p className="mt-1 truncate text-[11px] text-slate-600">
                              {(driver.phone ?? "n/a")} · {(driver.carNumber ?? "n/a")} · {statusLabel(driver.status)}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
