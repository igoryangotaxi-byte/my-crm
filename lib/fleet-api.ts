import type {
  DriverGeoDebugEvent,
  DriverMapItem,
  DriverMapStatus,
  DriverStatusHistoryEvent,
  FleetPartnerRef,
  DriversMapCounters,
  DriversMapResponse,
} from "@/types/crm";
import { kv } from "@vercel/kv";
import { promises as fs } from "node:fs";
import path from "node:path";

const FLEET_BASE_URL = process.env.FLEET_API_BASE_URL?.trim() || "https://fleet-api.yango.tech";
const FLEET_API_KEY = process.env.FLEET_API_KEY?.trim() || "";
const FLEET_CLIENT_ID = process.env.FLEET_CLIENT_ID?.trim() || "";
const FLEET_PARK_ID = process.env.FLEET_PARK_ID?.trim() || "";
const DEFAULT_FLEET_PARTNER_NAME = "S.O. LIGHTHOUSE LTD";
const FLEET_MAP_CACHE_TTL_MS = 30_000;
const FLEET_STATUS_CACHE_TTL_MS = 12_000;
const FLEET_RATE_LIMIT_COOLDOWN_MS = 120_000;
const FLEET_ACTIVE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const FLEET_MIN_STATUS_FETCH_INTERVAL_MS = 10_000;
const FLEET_MIN_GEO_FETCH_INTERVAL_MS = 45_000;
/** Треки только для части заказов (429); приоритет — поездка → занят → ожидание, новее первыми. */
const FLEET_TRACK_MAX_ORDERS = 28;
const FLEET_ORDERS_PAGE_LIMIT = 500;
const FLEET_ORDERS_MAX_PAGES = 12;
const FLEET_DRIVER_PROFILES_PATH = "/v1/parks/driver-profiles/list";
const FLEET_DRIVER_PROFILES_PAGE_LIMIT = 500;
const FLEET_DRIVER_PROFILES_MAX_PAGES = 20;
const FLEET_SUPPLY_HOURS_PATH = "/v2/parks/contractors/supply-hours";
const FLEET_SUPPLY_HOURS_CONCURRENCY = 6;
const FLEET_PROFILES_CACHE_TTL_MS = 60_000;
const FLEET_SUPPLY_CACHE_TTL_MS = 10 * 60_000;
const DRIVER_OBSERVATION_MAX_PER_DRIVER = 2880;

/*
FLEET_MAP_STATUS_SPEC — Yango Fleet → DriverMapStatus; менять синхронно с deriveIdleDriverMapStatus, mapOrderStatusToDriverMapStatus.

Данные: POST /v1/parks/driver-profiles/list (без fields); GET supply-hours; POST orders/list + orders/track.

1) Idle: not_working|fired → no_gps. in_order|on_order+GPS → active_trip; без GPS → no_gps. supply>0 → available+время.
   free|on_line|online|waiting_orders|order_provision → available.
   current_status **busy** → **busy** (как Yango: b932…, בן משה ואנונו); GPS только для маркера, не для статуса.
2) Заказ+трек (includeGeo): GPS нет → no_gps. transporting|in_order|on_order → active_trip. driving|waiting → busy. Иначе → no_gps.
3) DriversMap: маркер при lat&lon; точка с трека, иначе current_status/location/position в профиле.
Калибровка: Active trip = поездка; Available = free и/или supply>0; Busy = `current_status.status` busy.
*/
type DriverProfileRow = {
  contractorProfileId: string;
  /** Same as order.driver_profile.id when present; used to merge with orders. */
  driverProfileId: string;
  name: string;
  carNumber: string | null;
  callsign: string | null;
  phone: string | null;
  /** e.g. working | not_working | fired — from driver_profile when API returns it. */
  workStatus: string | null;
  /** Yango: `current_status.status` (e.g. free, busy, in_order). */
  currentStatus: string | null;
  /** Last known point from `current_status` (when Fleet returns it) — needed to place markers. */
  profileLat: number | null;
  profileLon: number | null;
};

type FleetDriverProfilesListResponse = {
  driver_profiles?: Array<Record<string, unknown>>;
  profiles?: Array<Record<string, unknown>>;
  items?: Array<Record<string, unknown>>;
  cursor?: string;
};

type FleetSupplyHoursResponse = {
  supply_duration_seconds?: number;
  total_seconds?: number;
};

let driverProfilesCache: { at: number; rows: DriverProfileRow[] } | null = null;
let supplySecondsByContractorCache: { at: number; map: Map<string, number> } | null = null;

type FleetOrderStatus = "driving" | "waiting" | "transporting";

type FleetOrdersListResponse = {
  orders?: Array<{
    id: string;
    status?: string;
    booked_at?: string | null;
    created_at?: string | null;
    driver_profile?: { id?: string; name?: string };
    car?: { id?: string; callsign?: string; license?: { number?: string } };
    park_details?: { company?: { id?: string; name?: string } };
  }>;
  cursor?: string;
};

type FleetTrackResponse = {
  track?: Array<{
    tracked_at?: string;
    order_status?: FleetOrderStatus;
    location?: { lat?: number; lon?: number };
  }>;
};

type FleetTrackPoint = NonNullable<FleetTrackResponse["track"]>[number];

const STATUS_HISTORY_WINDOW_MS = 24 * 60 * 60 * 1000;

let lastGoodDriversSnapshot:
  | {
      updatedAt: string;
      source: DriversMapResponse["source"];
      drivers: DriverMapItem[];
      counters: DriversMapCounters;
    }
  | null = null;
let lastGoodSnapshotAtMs = 0;
let fleetRateLimitedUntilMs = 0;
let lastFleetFetchAtMs = 0;
let diskSnapshotLoaded = false;
const FLEET_SNAPSHOT_FILE = path.join(process.cwd(), ".cache", "fleet-drivers-snapshot.json");
const FLEET_SNAPSHOT_KV_KEY = "appli:fleet:drivers-snapshot:v1";
const FLEET_KV_PERSIST_THROTTLE_MS = 4000;
let lastFleetKvPersistAtMs = 0;

function canUseFleetKv(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

type DriverObservation = {
  at: string;
  status: DriverMapStatus;
  includeGeo: boolean;
  source: DriverGeoDebugEvent["source"];
  lat: number | null;
  lon: number | null;
};

type PersistedFleetPayload = {
  updatedAt: string;
  source: DriversMapResponse["source"];
  drivers: DriverMapItem[];
  counters: DriversMapCounters;
  observations?: Record<string, DriverObservation[]>;
};
const driverObservationsById = new Map<string, DriverObservation[]>();
const driverObservationKeyByIdentity = new Map<string, string>();
const driverIdsByIdentity = new Map<string, Set<string>>();

function normalizeIdentityPart(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function buildDriverObservationIdentity(driver: Pick<DriverMapItem, "phone" | "carNumber" | "callsign" | "name">): string {
  const phone = normalizeIdentityPart(driver.phone);
  const car = normalizeIdentityPart(driver.carNumber);
  const callsign = normalizeIdentityPart(driver.callsign);
  const name = normalizeIdentityPart(driver.name);
  return [phone, car, callsign, name].join("|");
}

function hasMeaningfulIdentityKey(key: string): boolean {
  return key.split("|").some((part) => part.length > 0);
}

function applyPreviousSnapshotGeoFallback(
  drivers: DriverMapItem[],
  previousDrivers: DriverMapItem[] | undefined,
): DriverMapItem[] {
  if (!previousDrivers?.length) return drivers;
  const prevById = new Map<string, DriverMapItem>();
  const prevByIdentity = new Map<string, DriverMapItem>();
  for (const prev of previousDrivers) {
    prevById.set(prev.id, prev);
    const key = buildDriverObservationIdentity(prev);
    if (hasMeaningfulIdentityKey(key) && !prevByIdentity.has(key)) {
      prevByIdentity.set(key, prev);
    }
  }
  return drivers.map((driver) => {
    const hasCurrentGeo = driver.lat != null && driver.lon != null;
    if (hasCurrentGeo) return driver;
    const fromId = prevById.get(driver.id);
    const fromIdentity = prevByIdentity.get(buildDriverObservationIdentity(driver));
    const prev = fromId ?? fromIdentity ?? null;
    if (!prev || prev.lat == null || prev.lon == null) return driver;
    return {
      ...driver,
      lat: prev.lat,
      lon: prev.lon,
      lastTrackedAt: driver.lastTrackedAt ?? prev.lastTrackedAt ?? null,
    };
  });
}

/** In-memory последние координаты (переживает cached status-only ответы без lat/lon). */
const lastGeoByDriverId = new Map<string, { lat: number; lon: number; lastTrackedAt: string | null }>();
const lastGeoByIdentity = new Map<string, { lat: number; lon: number; lastTrackedAt: string | null }>();

function recordLastKnownGeo(drivers: DriverMapItem[]): void {
  for (const driver of drivers) {
    if (driver.lat == null || driver.lon == null) continue;
    const entry = { lat: driver.lat, lon: driver.lon, lastTrackedAt: driver.lastTrackedAt ?? null };
    lastGeoByDriverId.set(driver.id, entry);
    const identity = buildDriverObservationIdentity(driver);
    if (hasMeaningfulIdentityKey(identity)) {
      lastGeoByIdentity.set(identity, entry);
    }
  }
}

/** После загрузки наблюдений с KV/диска — восстановить lastGeo-кэш (новый serverless-инстанс). */
function rebuildLastKnownGeoAfterObservationLoad(): void {
  for (const [driverId, list] of driverObservationsById) {
    const last = [...list].reverse().find((e) => e.lat != null && e.lon != null);
    if (!last || last.lat == null || last.lon == null) continue;
    lastGeoByDriverId.set(driverId, {
      lat: last.lat,
      lon: last.lon,
      lastTrackedAt: last.at,
    });
  }
  for (const driver of lastGoodDriversSnapshot?.drivers ?? []) {
    const entry = lastGeoByDriverId.get(driver.id);
    if (!entry) continue;
    const identity = buildDriverObservationIdentity(driver);
    if (hasMeaningfulIdentityKey(identity)) {
      lastGeoByIdentity.set(identity, entry);
    }
  }
}

function applyLastKnownGeoCache(drivers: DriverMapItem[]): DriverMapItem[] {
  return drivers.map((driver) => {
    if (driver.lat != null && driver.lon != null) return driver;
    const fromId = lastGeoByDriverId.get(driver.id);
    const identity = buildDriverObservationIdentity(driver);
    const fromIdentity = hasMeaningfulIdentityKey(identity) ? lastGeoByIdentity.get(identity) : undefined;
    const geo = fromId ?? fromIdentity;
    if (!geo) return driver;
    return {
      ...driver,
      lat: geo.lat,
      lon: geo.lon,
      lastTrackedAt: driver.lastTrackedAt ?? geo.lastTrackedAt ?? null,
    };
  });
}

function mergeGeoForDisplay(drivers: DriverMapItem[], previousDrivers: DriverMapItem[] | undefined): DriverMapItem[] {
  return applyPreviousSnapshotGeoFallback(applyLastKnownGeoCache(drivers), previousDrivers);
}

function registerDriverIdentity(identity: string, driverId: string): void {
  const ids = driverIdsByIdentity.get(identity) ?? new Set<string>();
  ids.add(driverId);
  driverIdsByIdentity.set(identity, ids);
}

function collectObservationsForIdentity(identity: string, currentDriverId: string): { historyKey: string; list: DriverObservation[] } {
  const canonicalKey = driverObservationKeyByIdentity.get(identity) ?? currentDriverId;
  const ids = new Set<string>([currentDriverId, canonicalKey, ...(driverIdsByIdentity.get(identity) ?? new Set<string>())]);
  const merged = new Map<string, DriverObservation>();
  for (const id of ids) {
    const list = driverObservationsById.get(id) ?? [];
    for (const item of list) {
      const k = `${item.at}|${item.status}|${item.source}|${item.includeGeo ? "1" : "0"}|${item.lat ?? "n"}|${item.lon ?? "n"}`;
      merged.set(k, item);
    }
  }
  const out = [...merged.values()].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  return { historyKey: canonicalKey, list: out };
}

function backfillObservationsFromDriverHistory(
  history: DriverStatusHistoryEvent[] | undefined,
  includeGeo: boolean,
  lat: number | null,
  lon: number | null,
): DriverObservation[] {
  const out: DriverObservation[] = [];
  for (const event of history ?? []) {
    const ts = new Date(event.at).getTime();
    if (Number.isNaN(ts)) continue;
    out.push({
      at: new Date(ts).toISOString(),
      status: event.status,
      includeGeo,
      source: lat != null && lon != null ? "carry" : "missing",
      lat,
      lon,
    });
  }
  return out;
}

function appendDriverObservations(
  drivers: DriverMapItem[],
  includeGeo: boolean,
  geoSourceByDriver: Map<string, DriverGeoDebugEvent["source"]>,
): void {
  const nowMs = Date.now();
  const cutoffMs = nowMs - STATUS_HISTORY_WINDOW_MS;
  const atIso = new Date(nowMs).toISOString();
  for (const driver of drivers) {
    const identity = buildDriverObservationIdentity(driver);
    registerDriverIdentity(identity, driver.id);
    if (!driverObservationKeyByIdentity.has(identity)) {
      driverObservationKeyByIdentity.set(identity, driver.id);
    }
    const { historyKey, list } = collectObservationsForIdentity(identity, driver.id);
    const seeded = [...list, ...backfillObservationsFromDriverHistory(driver.statusHistory24h, includeGeo, driver.lat, driver.lon)];
    const pruned = seeded.filter((entry) => {
      const ts = new Date(entry.at).getTime();
      return !Number.isNaN(ts) && ts >= cutoffMs;
    });
    const latest = pruned[pruned.length - 1];
    const next: DriverObservation = {
      at: atIso,
      status: driver.status,
      includeGeo,
      source: geoSourceByDriver.get(driver.id) ?? (driver.lat != null && driver.lon != null ? "carry" : "missing"),
      lat: driver.lat,
      lon: driver.lon,
    };
    const sameAsLatest =
      latest &&
      latest.status === next.status &&
      latest.includeGeo === next.includeGeo &&
      latest.source === next.source &&
      latest.lat === next.lat &&
      latest.lon === next.lon;
    if (!sameAsLatest) {
      pruned.push(next);
      console.info(
        `[drivers-map] observe id=${driver.id} status=${driver.status} src=${next.source} lat=${driver.lat ?? "null"} lon=${driver.lon ?? "null"} includeGeo=${includeGeo ? "1" : "0"}`,
      );
    }
    if (pruned.length > DRIVER_OBSERVATION_MAX_PER_DRIVER) {
      pruned.splice(0, pruned.length - DRIVER_OBSERVATION_MAX_PER_DRIVER);
    }
    const allIds = driverIdsByIdentity.get(identity) ?? new Set<string>([driver.id]);
    allIds.add(historyKey);
    for (const id of allIds) {
      driverObservationsById.set(id, pruned);
    }
  }
}

/** Каждый ответ /api/drivers-map: дописать наблюдения (и console.info при изменении) + обновить lastGeo-кэш; KV — чтобы прод переживал refresh. */
async function appendObservationsAndRecordFleetGeo(
  drivers: DriverMapItem[],
  includeGeo: boolean,
  geoSourceByDriver: Map<string, DriverGeoDebugEvent["source"]>,
  options?: { skipThrottledKvPersist?: boolean },
): Promise<void> {
  appendDriverObservations(drivers, includeGeo, geoSourceByDriver);
  recordLastKnownGeo(drivers);
  if (!options?.skipThrottledKvPersist) {
    await maybePersistFleetStateAfterObservations();
  }
}

function buildDriverGeoDebug(drivers: DriverMapItem[]): Record<string, DriverGeoDebugEvent[]> {
  const nowMs = Date.now();
  const cutoffMs = nowMs - STATUS_HISTORY_WINDOW_MS;
  const out: Record<string, DriverGeoDebugEvent[]> = {};
  for (const driver of drivers) {
    const identity = buildDriverObservationIdentity(driver);
    const { historyKey, list } = collectObservationsForIdentity(identity, driver.id);
    const entries = list
      .filter((entry) => {
        const ts = new Date(entry.at).getTime();
        return !Number.isNaN(ts) && ts >= cutoffMs;
      })
      .slice(-120)
      .map((entry) => ({
        historyKey,
        at: entry.at,
        status: entry.status,
        includeGeo: entry.includeGeo,
        source: entry.source,
        lat: entry.lat,
        lon: entry.lon,
      }));
    out[driver.id] = entries;
  }
  return out;
}

function maybeDebugGeoPayload(drivers: DriverMapItem[], enabled?: boolean): Pick<DriversMapResponse, "driverGeoDebug"> | {} {
  if (!enabled) return {};
  return { driverGeoDebug: buildDriverGeoDebug(drivers) };
}

function hydrateDriversWithObservations(drivers: DriverMapItem[]): DriverMapItem[] {
  const nowMs = Date.now();
  const cutoffMs = nowMs - STATUS_HISTORY_WINDOW_MS;
  return drivers.map((driver) => {
    const identity = buildDriverObservationIdentity(driver);
    const { list } = collectObservationsForIdentity(identity, driver.id);
    const timeline = list.filter((entry) => {
      const ts = new Date(entry.at).getTime();
      return !Number.isNaN(ts) && ts >= cutoffMs;
    });
    if (!timeline.length) return driver;
    /** Последняя точка с lat/lon в окне 24h — без отсечки «10 мин», иначе активная поездка без свежего трека теряет маркер. */
    const latestGeo =
      [...timeline]
        .reverse()
        .find((entry) => entry.lat != null && entry.lon != null) ?? null;
    const mergedHistoryRaw: DriverStatusHistoryEvent[] = [
      ...timeline.map((entry) => ({ status: entry.status, at: entry.at })),
      ...driver.statusHistory24h,
    ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    const mergedHistory: DriverStatusHistoryEvent[] = [];
    for (const event of mergedHistoryRaw) {
      const prev = mergedHistory[mergedHistory.length - 1];
      if (prev && prev.status === event.status) continue;
      mergedHistory.push(event);
      if (mergedHistory.length >= 24) break;
    }
    return {
      ...driver,
      lat: driver.lat ?? latestGeo?.lat ?? null,
      lon: driver.lon ?? latestGeo?.lon ?? null,
      lastTrackedAt: driver.lastTrackedAt ?? latestGeo?.at ?? null,
      statusHistory24h: mergedHistory.length ? mergedHistory : [{ status: driver.status, at: new Date(nowMs).toISOString() }],
    };
  });
}

function observationCoord(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

const GEO_DEBUG_SOURCES = new Set<DriverGeoDebugEvent["source"]>(["profile", "track", "carry", "missing"]);

function normalizeObservationEvents(events: unknown[]): DriverObservation[] {
  return events
    .filter((e): e is Record<string, unknown> => e != null && typeof e === "object")
    .filter((e) => typeof e.at === "string" && typeof e.status === "string")
    .map((e) => {
      const rawSource = typeof e.source === "string" ? e.source : "carry";
      const source: DriverGeoDebugEvent["source"] = GEO_DEBUG_SOURCES.has(rawSource as DriverGeoDebugEvent["source"])
        ? (rawSource as DriverGeoDebugEvent["source"])
        : "carry";
      return {
        at: e.at as string,
        status: e.status as DriverMapStatus,
        includeGeo: Boolean(e.includeGeo),
        source,
        lat: observationCoord(e.lat),
        lon: observationCoord(e.lon),
      };
    });
}

function applyPersistedFleetPayload(parsed: PersistedFleetPayload): void {
  if (!Array.isArray(parsed.drivers) || !parsed.counters) return;
  lastGoodDriversSnapshot = {
    updatedAt: parsed.updatedAt,
    source: parsed.source,
    drivers: parsed.drivers,
    counters: parsed.counters,
  };
  lastGoodSnapshotAtMs = Date.now();

  for (const driver of parsed.drivers) {
    registerDriverIdentity(buildDriverObservationIdentity(driver), driver.id);
  }

  if (parsed.observations && typeof parsed.observations === "object") {
    for (const [key, events] of Object.entries(parsed.observations)) {
      if (!Array.isArray(events)) continue;
      driverObservationsById.set(key, normalizeObservationEvents(events));
      const owner = parsed.drivers.find((d) => d.id === key);
      if (owner) {
        const identity = buildDriverObservationIdentity(owner);
        if (!driverObservationKeyByIdentity.has(identity)) {
          driverObservationKeyByIdentity.set(identity, key);
        }
      }
    }
    for (const driver of parsed.drivers) {
      const identity = buildDriverObservationIdentity(driver);
      const canonical = driverObservationKeyByIdentity.get(identity) ?? driver.id;
      const list = driverObservationsById.get(canonical) ?? driverObservationsById.get(driver.id) ?? [];
      if (list.length) {
        driverObservationsById.set(driver.id, list);
      }
    }
  } else {
    for (const driver of parsed.drivers) {
      const seeded = backfillObservationsFromDriverHistory(driver.statusHistory24h, false, driver.lat, driver.lon);
      if (seeded.length) {
        driverObservationsById.set(driver.id, seeded);
      }
    }
  }

  rebuildLastKnownGeoAfterObservationLoad();
}

async function ensureSnapshotLoadedFromDisk(): Promise<void> {
  if (diskSnapshotLoaded) return;
  diskSnapshotLoaded = true;

  let parsed: PersistedFleetPayload | null = null;

  if (canUseFleetKv()) {
    try {
      const fromKv = await kv.get<PersistedFleetPayload>(FLEET_SNAPSHOT_KV_KEY);
      if (fromKv && Array.isArray(fromKv.drivers) && fromKv.counters) {
        parsed = fromKv;
      }
    } catch {
      // KV optional
    }
  }

  if (!parsed) {
    try {
      const raw = await fs.readFile(FLEET_SNAPSHOT_FILE, "utf8");
      parsed = JSON.parse(raw) as PersistedFleetPayload;
    } catch {
      // no local snapshot
    }
  }

  if (!parsed || !Array.isArray(parsed.drivers) || !parsed.counters) return;
  applyPersistedFleetPayload(parsed);
}

async function persistFleetSnapshot(snapshot: {
  updatedAt: string;
  source: DriversMapResponse["source"];
  drivers: DriverMapItem[];
  counters: DriversMapCounters;
}): Promise<void> {
  const observations: Record<string, DriverObservation[]> = {};
  for (const driver of snapshot.drivers) {
    const identity = buildDriverObservationIdentity(driver);
    const { historyKey, list } = collectObservationsForIdentity(identity, driver.id);
    observations[historyKey] = list.slice(-240);
  }
  const payload: PersistedFleetPayload = { ...snapshot, observations };

  if (canUseFleetKv()) {
    try {
      await kv.set(FLEET_SNAPSHOT_KV_KEY, payload);
    } catch {
      // best-effort
    }
  }

  try {
    await fs.mkdir(path.dirname(FLEET_SNAPSHOT_FILE), { recursive: true });
    await fs.writeFile(FLEET_SNAPSHOT_FILE, JSON.stringify(payload), "utf8");
  } catch {
    // best-effort persistence only
  }
  lastFleetKvPersistAtMs = Date.now();
}

async function maybePersistFleetStateAfterObservations(): Promise<void> {
  if (!lastGoodDriversSnapshot?.drivers.length) return;
  const now = Date.now();
  if (now - lastFleetKvPersistAtMs < FLEET_KV_PERSIST_THROTTLE_MS) return;
  lastFleetKvPersistAtMs = now;
  await persistFleetSnapshot(lastGoodDriversSnapshot);
}

function buildCounters(drivers: DriverMapItem[]): DriversMapCounters {
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
  return { available, activeTrip, busy, noGps, total: drivers.length };
}

function formatBusyLabel(minutes: number | null, status: DriverMapStatus): string {
  if (status === "active_trip") {
    if (minutes == null || minutes < 1) return "Active trip";
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h > 0) return `Active trip ${h}h ${m}m`;
    return `Active trip ${m}m`;
  }
  if (status === "available") return "Available";
  if (minutes == null || minutes < 1) return status === "no_gps" ? "No GPS" : "Busy";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) return `Busy ${h}h ${m}m`;
  return `Busy ${m}m`;
}

function toBusyMinutes(startedAt?: string | null): number | null {
  if (!startedAt) return null;
  const startedMs = new Date(startedAt).getTime();
  if (Number.isNaN(startedMs)) return null;
  const diffMin = Math.max(0, Math.floor((Date.now() - startedMs) / 60000));
  return diffMin;
}

function mapFleetStatus(statusRaw?: string): DriverMapStatus {
  const status = (statusRaw ?? "").toLowerCase();
  if (status === "transporting" || status === "in_order" || status === "on_order") return "active_trip";
  if (status === "driving" || status === "waiting") return "busy";
  return "no_gps";
}

/** См. `FLEET_MAP_STATUS_SPEC` (§2). */
function mapOrderStatusToDriverMapStatus(
  normalizedStatus: string,
  hasGps: boolean,
  includeGeo: boolean,
): DriverMapStatus {
  if (!includeGeo) {
    if (normalizedStatus === "transporting" || normalizedStatus === "in_order" || normalizedStatus === "on_order") {
      return "active_trip";
    }
    if (normalizedStatus === "driving" || normalizedStatus === "waiting") return "busy";
    return "no_gps";
  }
  if (!hasGps) {
    return "no_gps";
  }
  if (normalizedStatus === "transporting" || normalizedStatus === "in_order" || normalizedStatus === "on_order") {
    return "active_trip";
  }
  if (normalizedStatus === "driving" || normalizedStatus === "waiting") {
    return "busy";
  }
  return "no_gps";
}

function buildStatusHistory24h(track: FleetTrackResponse["track"], fallbackStatus: DriverMapStatus): DriverStatusHistoryEvent[] {
  const now = Date.now();
  const points = (track ?? [])
    .map((point) => {
      const at = point.tracked_at ? new Date(point.tracked_at).getTime() : Number.NaN;
      if (Number.isNaN(at)) return null;
      if (now - at > STATUS_HISTORY_WINDOW_MS) return null;
      const status = mapFleetStatus(point.order_status);
      return { status, at: new Date(at).toISOString() };
    })
    .filter((item): item is DriverStatusHistoryEvent => Boolean(item))
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  const unique: DriverStatusHistoryEvent[] = [];
  for (const event of points) {
    const prev = unique[unique.length - 1];
    if (prev && prev.status === event.status) {
      continue;
    }
    unique.push(event);
    if (unique.length >= 12) break;
  }
  if (!unique.length) {
    return [{ status: fallbackStatus, at: new Date().toISOString() }];
  }
  return unique;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function joinFirstLast(first: string | null, last: string | null): string | null {
  if (!first && !last) return null;
  return [first, last].filter(Boolean).join(" ").trim() || null;
}

function buildDisplayNameFromProfile(
  row: Record<string, unknown>,
  driverNested: Record<string, unknown> | null,
  idFallback: string,
): string {
  const person = asRecord((row as { person?: unknown }).person);
  const fromPerson = joinFirstLast(
    asString((person as { first_name?: string } | null)?.first_name) ?? asString((person as { name?: { first?: string } } | null)?.name?.first),
    asString((person as { last_name?: string } | null)?.last_name) ?? asString((person as { name?: { last?: string } } | null)?.name?.last),
  );
  const fromRoot = joinFirstLast(
    asString((row as { first_name?: string }).first_name),
    asString((row as { last_name?: string }).last_name),
  );
  const fromDriver = driverNested
    ? joinFirstLast(
        asString((driverNested as { first_name?: string }).first_name) ?? asString((driverNested as { first?: string }).first),
        asString((driverNested as { last_name?: string }).last_name) ?? asString((driverNested as { last?: string }).last),
      )
    : null;
  const fromFullName =
    asString((row as { full_name?: string }).full_name) ??
    asString((row as { fullname?: string }).fullname) ??
    (driverNested ? asString((driverNested as { full_name?: string }).full_name) : null);
  const rowNameObj = asRecord((row as { name?: unknown }).name);
  const driverNameObj = driverNested ? asRecord((driverNested as { name?: unknown }).name) : null;
  const fromNameObjects = joinFirstLast(
    asString(rowNameObj?.first) ?? asString((rowNameObj as { first_name?: string })?.first_name),
    asString(rowNameObj?.last) ?? asString((rowNameObj as { last_name?: string })?.last_name),
  ) ?? (driverNameObj
    ? joinFirstLast(
        asString(driverNameObj.first) ?? asString((driverNameObj as { first_name?: string })?.first_name),
        asString(driverNameObj.last) ?? asString((driverNameObj as { last_name?: string })?.last_name),
      )
    : null);
  const singleName =
    typeof row.name === "string"
      ? asString(row.name)
      : asString((rowNameObj as { string?: string })?.string);
  const fromNestedStr =
    driverNested && typeof (driverNested as { name?: unknown }).name === "string"
      ? asString((driverNested as { name: string }).name)
      : null;
  const name =
    fromFullName ||
    fromNameObjects ||
    fromPerson ||
    fromRoot ||
    fromDriver ||
    fromNestedStr ||
    singleName ||
    (idFallback ? `Driver ${idFallback.slice(0, 6)}` : "Driver");
  return name.trim() || (idFallback ? `Driver ${idFallback.slice(0, 6)}` : "Driver");
}

function buildDriverProfileRow(row: Record<string, unknown>): DriverProfileRow | null {
  const driverNested = asRecord(row.driver_profile);
  const car = asRecord(row.car) ?? (driverNested ? asRecord(driverNested.car) : null);
  const license = car ? asRecord(car.license) : null;
  const contractorProfileId =
    asString(row.contractor_profile_id) ?? asString(row.contractor_id) ?? asString(row.park_contractor_id);
  const driverProfileId = asString(row.id) ?? asString(row.driver_id) ?? asString(driverNested?.id);
  if (!contractorProfileId && !driverProfileId) {
    return null;
  }
  const idForDisplay = (contractorProfileId || driverProfileId) ?? "";
  const name = buildDisplayNameFromProfile(row, driverNested, idForDisplay);
  const carNumber = asString(license?.number) ?? asString(row.license_number) ?? (car ? asString(car.number) : null) ?? null;
  const callsign = car ? asString(car.callsign) : asString((row as { callsign?: string }).callsign);
  const phone =
    asString((row as { personal_phone_id?: string; phone?: string; msisdn?: string }).phone) ??
    asString((row as { personal_phone_id?: string; phone?: string; msisdn?: string }).msisdn);
  const workStatus = extractWorkStatusFromProfile(row, driverNested);
  const currentStatus = extractCurrentStatusFromRow(row);
  const { lat: profileLat, lon: profileLon } = extractProfilePositionFromRow(row, driverNested);
  return {
    contractorProfileId: contractorProfileId || driverProfileId!,
    driverProfileId: driverProfileId || contractorProfileId!,
    name,
    carNumber,
    callsign: callsign,
    phone: phone ?? null,
    workStatus,
    currentStatus,
    profileLat,
    profileLon,
  };
}

function parseDriverProfileListPayload(
  payload: FleetDriverProfilesListResponse,
): Array<Record<string, unknown>> {
  if (Array.isArray(payload.driver_profiles)) return payload.driver_profiles as Array<Record<string, unknown>>;
  if (Array.isArray(payload.profiles)) return payload.profiles as Array<Record<string, unknown>>;
  if (Array.isArray(payload.items)) return payload.items as Array<Record<string, unknown>>;
  return [];
}

async function fetchFleetJson<T>(url: string, init?: RequestInit): Promise<T> {
  const needsParkHeader = url.includes(FLEET_SUPPLY_HOURS_PATH);
  const response = await fetch(url, {
    method: init?.method ?? "GET",
    headers: {
      "X-API-Key": FLEET_API_KEY,
      "X-Client-ID": FLEET_CLIENT_ID,
      ...(needsParkHeader && FLEET_PARK_ID ? { "X-Park-ID": FLEET_PARK_ID } : {}),
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
    body: init?.body,
    cache: "no-store",
  });
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`Fleet API HTTP ${response.status}: ${raw.slice(0, 300)}`);
  }
  return (raw ? JSON.parse(raw) : {}) as T;
}

async function fetchFleetOrdersPage(input: {
  fromIso: string;
  toIso: string;
  cursor?: string;
}): Promise<FleetOrdersListResponse> {
  const body = {
    query: {
      park: {
        id: FLEET_PARK_ID,
        order: {
          booked_at: {
            from: input.fromIso,
            to: input.toIso,
          },
          statuses: ["driving", "waiting", "transporting"],
        },
      },
    },
    limit: FLEET_ORDERS_PAGE_LIMIT,
    ...(input.cursor ? { cursor: input.cursor } : {}),
  };
  return fetchFleetJson<FleetOrdersListResponse>(`${FLEET_BASE_URL}/v1/parks/orders/list`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

async function fetchFleetOrdersWindow(input: {
  fromIso: string;
  toIso: string;
}): Promise<NonNullable<FleetOrdersListResponse["orders"]>> {
  const allOrders: NonNullable<FleetOrdersListResponse["orders"]> = [];
  let cursor: string | undefined;
  for (let page = 0; page < FLEET_ORDERS_MAX_PAGES; page += 1) {
    const payload = await fetchFleetOrdersPage({
      fromIso: input.fromIso,
      toIso: input.toIso,
      cursor,
    });
    const chunk = payload.orders ?? [];
    if (chunk.length === 0) break;
    allOrders.push(...chunk);
    if (chunk.length < FLEET_ORDERS_PAGE_LIMIT) break;
    const nextCursor = payload.cursor?.trim();
    if (!nextCursor || nextCursor === cursor) break;
    cursor = nextCursor;
  }
  return allOrders;
}

async function fetchOrderTrack(orderId: string): Promise<FleetTrackResponse> {
  const query = new URLSearchParams({ order_id: orderId, park_id: FLEET_PARK_ID });
  return fetchFleetJson<FleetTrackResponse>(`${FLEET_BASE_URL}/v1/parks/orders/track?${query.toString()}`, {
    method: "POST",
  });
}

async function fetchDriverProfilesPage(cursor: string | undefined): Promise<FleetDriverProfilesListResponse> {
  /** Do not send `fields` — a narrowed `fields` payload strips `driver_profile` / `current_status` in production. */
  const body = {
    query: { park: { id: FLEET_PARK_ID } },
    limit: FLEET_DRIVER_PROFILES_PAGE_LIMIT,
    ...(cursor ? { cursor } : {}),
  };
  return fetchFleetJson<FleetDriverProfilesListResponse>(`${FLEET_BASE_URL}${FLEET_DRIVER_PROFILES_PATH}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

async function fetchAllDriverProfileRows(): Promise<DriverProfileRow[]> {
  const rows: DriverProfileRow[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < FLEET_DRIVER_PROFILES_MAX_PAGES; page += 1) {
    const payload = await fetchDriverProfilesPage(cursor);
    const raw = parseDriverProfileListPayload(payload);
    for (const r of raw) {
      const p = buildDriverProfileRow(r);
      if (p) rows.push(p);
    }
    if (raw.length < FLEET_DRIVER_PROFILES_PAGE_LIMIT) break;
    const next = payload.cursor?.trim();
    if (!next || next === cursor) break;
    cursor = next;
  }
  return rows;
}

async function fetchContractorSupplyHours(contractorProfileId: string, fromIso: string, toIso: string): Promise<number> {
  const params = new URLSearchParams({
    contractor_profile_id: contractorProfileId,
    period_from: fromIso,
    period_to: toIso,
  });
  const data = await fetchFleetJson<FleetSupplyHoursResponse>(
    `${FLEET_BASE_URL}${FLEET_SUPPLY_HOURS_PATH}?${params.toString()}`,
    { method: "GET" },
  );
  return typeof data.supply_duration_seconds === "number" && Number.isFinite(data.supply_duration_seconds)
    ? data.supply_duration_seconds
    : 0;
}

function formatAvailableSupplyLabel(supplySeconds: number): string {
  const m = Math.floor(supplySeconds / 60);
  if (m < 1) return "Available";
  if (m < 60) return `Available ${m}m`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest > 0 ? `Available ${h}h ${rest}m` : `Available ${h}h`;
}

function extractWorkStatusFromProfile(
  row: Record<string, unknown>,
  driverNested: Record<string, unknown> | null,
): string | null {
  return (
    asString((driverNested as { work_status?: string } | null)?.work_status) ??
    asString((row as { work_status?: string }).work_status) ??
    asString((driverNested as { work_status_id?: string } | null)?.work_status_id) ??
    null
  );
}

function extractCurrentStatusFromRow(row: Record<string, unknown>): string | null {
  const cur = asRecord(row.current_status);
  if (cur) {
    return (
      asString((cur as { status?: string }).status) ??
      asString((cur as { state?: string }).state) ??
      null
    );
  }
  return asString((row as { driver_status?: string }).driver_status);
}

function readLatLonFromObject(obj: Record<string, unknown> | null | undefined): { lat: number; lon: number } | null {
  if (!obj) return null;
  const directLat =
    asFiniteNumber((obj as { lat?: unknown }).lat) ??
    asFiniteNumber((obj as { latitude?: unknown }).latitude);
  const directLon =
    asFiniteNumber((obj as { lon?: unknown }).lon) ??
    asFiniteNumber((obj as { lng?: unknown }).lng) ??
    asFiniteNumber((obj as { longitude?: unknown }).longitude);
  if (directLat != null && directLon != null) {
    return { lat: directLat, lon: directLon };
  }
  const coords = (obj as { coordinates?: unknown; coords?: unknown }).coordinates ?? (obj as { coords?: unknown }).coords;
  if (Array.isArray(coords) && coords.length >= 2) {
    const a0 = asFiniteNumber(coords[0]);
    const a1 = asFiniteNumber(coords[1]);
    if (a0 != null && a1 != null) {
      const abs0 = Math.abs(a0);
      const abs1 = Math.abs(a1);
      if (abs0 <= 90 && abs1 > 90) {
        return { lat: a0, lon: a1 };
      }
      if (abs1 <= 90 && abs0 > 90) {
        return { lat: a1, lon: a0 };
      }
      const lon = a0;
      const lat = a1;
      return { lat, lon };
    }
  }
  const loc = asRecord(obj.location) ?? asRecord((obj as { point?: unknown }).point);
  if (loc) {
    const la =
      asFiniteNumber((loc as { lat?: unknown }).lat) ??
      asFiniteNumber((loc as { latitude?: unknown }).latitude);
    const lo =
      asFiniteNumber((loc as { lon?: unknown }).lon) ??
      asFiniteNumber((loc as { lng?: unknown }).lng) ??
      asFiniteNumber((loc as { longitude?: unknown }).longitude);
    if (la != null && lo != null) {
      return { lat: la, lon: lo };
    }
    const nestedCoords =
      (loc as { coordinates?: unknown; coords?: unknown }).coordinates ?? (loc as { coords?: unknown }).coords;
    if (Array.isArray(nestedCoords) && nestedCoords.length >= 2) {
      const a0 = asFiniteNumber(nestedCoords[0]);
      const a1 = asFiniteNumber(nestedCoords[1]);
      if (a0 != null && a1 != null) {
        const abs0 = Math.abs(a0);
        const abs1 = Math.abs(a1);
        if (abs0 <= 90 && abs1 > 90) {
          return { lat: a0, lon: a1 };
        }
        if (abs1 <= 90 && abs0 > 90) {
          return { lat: a1, lon: a0 };
        }
        const lon = a0;
        const lat = a1;
        return { lat, lon };
      }
    }
  }
  const la =
    asFiniteNumber((obj as { lat?: unknown }).lat) ??
    asFiniteNumber((obj as { latitude?: unknown }).latitude);
  const lo =
    asFiniteNumber((obj as { lon?: unknown }).lon) ??
    asFiniteNumber((obj as { lng?: unknown }).lng) ??
    asFiniteNumber((obj as { longitude?: unknown }).longitude);
  if (la != null && lo != null) {
    return { lat: la, lon: lo };
  }
  return null;
}

const GEO_HINT_KEYS = [
  "location",
  "position",
  "point",
  "coordinates",
  "coords",
  "geo",
  "geoposition",
  "navigation",
  "driver_position",
  "last_position",
  "last_known_position",
  "driver_coordinates",
  "map_position",
  "check_in",
  "checkpoint",
];

function readLatLonDeep(value: unknown, depth: number, seen: Set<unknown>): { lat: number; lon: number } | null {
  if (depth <= 0 || value == null) return null;
  if (typeof value !== "object") return null;
  if (seen.has(value)) return null;
  seen.add(value);

  const direct = readLatLonFromObject(value as Record<string, unknown>);
  if (direct) return direct;

  const rec = value as Record<string, unknown>;
  for (const key of GEO_HINT_KEYS) {
    const nested = rec[key];
    const ll = readLatLonDeep(nested, depth - 1, seen);
    if (ll) return ll;
  }

  for (const [key, nested] of Object.entries(rec)) {
    if (!nested || typeof nested !== "object") continue;
    const k = key.toLowerCase();
    if (
      !k.includes("lat") &&
      !k.includes("lon") &&
      !k.includes("lng") &&
      !k.includes("geo") &&
      !k.includes("pos") &&
      !k.includes("coord") &&
      !k.includes("nav") &&
      !k.includes("map")
    ) {
      continue;
    }
    const ll = readLatLonDeep(nested, depth - 1, seen);
    if (ll) return ll;
  }
  return null;
}

function readLatLonFromTrackPoint(point: FleetTrackPoint | null | undefined): { lat: number; lon: number } | null {
  const location = asRecord(point?.location);
  if (!location) return null;
  return readLatLonFromObject(location);
}

function extractProfilePositionFromRow(
  row: Record<string, unknown>,
  driverNested: Record<string, unknown> | null,
): { lat: number | null; lon: number | null } {
  const candidates: unknown[] = [
    row.current_status,
    (row as { location?: unknown }).location,
    (row as { position?: unknown }).position,
    driverNested,
    driverNested?.current_status,
    driverNested?.location,
    driverNested?.position,
    (driverNested as { last_known_position?: unknown } | null)?.last_known_position,
    (row as { driver_profile?: unknown }).driver_profile,
  ];
  for (const candidate of candidates) {
    const ll = readLatLonDeep(candidate, 5, new Set());
    if (ll) {
      return { lat: ll.lat, lon: ll.lon };
    }
  }
  const fromWholeRow = readLatLonDeep(row, 5, new Set());
  if (fromWholeRow) {
    return { lat: fromWholeRow.lat, lon: fromWholeRow.lon };
  }
  return { lat: null, lon: null };
}

/** См. `FLEET_MAP_STATUS_SPEC` (§1) — нет перекрывающей строки в orders. */
function deriveIdleDriverMapStatus(
  workStatus: string | null,
  currentStatus: string | null,
  supplySec: number,
  hasGps: boolean,
): { status: DriverMapStatus; busyLabel: string } {
  const ws = (workStatus ?? "").toLowerCase();
  const cs = (currentStatus ?? "").toLowerCase();

  if (ws === "fired" || ws === "not_working") {
    return { status: "no_gps", busyLabel: "No GPS" };
  }

  if (cs === "in_order" || cs === "inorder" || cs === "on_order") {
    if (!hasGps) {
      return { status: "no_gps", busyLabel: "No GPS" };
    }
    return { status: "active_trip", busyLabel: "Active trip" };
  }

  if (supplySec > 0) {
    return { status: "available", busyLabel: formatAvailableSupplyLabel(supplySec) };
  }

  if (cs === "free" || cs === "on_line" || cs === "online" || cs === "waiting_orders" || cs === "order_provision") {
    return { status: "available", busyLabel: "Available" };
  }

  if (cs === "busy") {
    return { status: "busy", busyLabel: "Busy" };
  }

  if (ws === "working") {
    return { status: "no_gps", busyLabel: "No GPS" };
  }

  return { status: "no_gps", busyLabel: "No GPS" };
}

function resolveContractorMergeKey(
  orderDriverId: string,
  driverIdToContractor: Map<string, string>,
  profileRows: DriverProfileRow[],
): string {
  if (!orderDriverId) {
    return "";
  }
  const direct = driverIdToContractor.get(orderDriverId);
  if (direct) {
    return direct;
  }
  for (const p of profileRows) {
    if (p.driverProfileId === orderDriverId || p.contractorProfileId === orderDriverId) {
      return p.contractorProfileId;
    }
  }
  return orderDriverId;
}

function pickRicherName(orderName: string | null, existing: string | null, fallback: string): string {
  const o = (orderName ?? "").trim();
  const e = (existing ?? "").trim();
  if (e && !e.startsWith("Driver ") && e.length >= 3) return e;
  if (o && !o.startsWith("Driver ")) return o;
  if (e) return e;
  if (o) return o;
  return fallback;
}

async function buildSupplyMap(
  contractorIds: string[],
  fromIso: string,
  toIso: string,
  options: { force: boolean },
): Promise<Map<string, number>> {
  if (
    !options.force &&
    supplySecondsByContractorCache &&
    Date.now() - supplySecondsByContractorCache.at < FLEET_SUPPLY_CACHE_TTL_MS
  ) {
    return new Map(supplySecondsByContractorCache.map);
  }
  const out = new Map<string, number>();
  for (let i = 0; i < contractorIds.length; i += FLEET_SUPPLY_HOURS_CONCURRENCY) {
    const batch = contractorIds.slice(i, i + FLEET_SUPPLY_HOURS_CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (id) => {
        try {
          return { id, sec: await fetchContractorSupplyHours(id, fromIso, toIso) };
        } catch {
          return { id, sec: 0 };
        }
      }),
    );
    for (const { id, sec } of results) {
      out.set(id, sec);
    }
  }
  supplySecondsByContractorCache = { at: Date.now(), map: new Map(out) };
  return out;
}

function applyActiveOrdersToDrivers(
  driversById: Map<string, DriverMapItem>,
  geoSourceByDriver: Map<string, DriverGeoDebugEvent["source"]>,
  driverIdToContractor: Map<string, string>,
  profileRows: DriverProfileRow[],
  orders: NonNullable<FleetOrdersListResponse["orders"]>,
  includeGeo: boolean,
  trackByOrder: Map<string, FleetTrackResponse["track"]>,
): void {
  for (const order of orders) {
    const orderDriverId = order.driver_profile?.id?.trim() ?? "";
    const partnerId = order.park_details?.company?.id?.trim() || FLEET_PARK_ID || null;
    const partnerName = order.park_details?.company?.name?.trim() || DEFAULT_FLEET_PARTNER_NAME;
    const carNumber = order.car?.license?.number?.trim() ?? null;
    const callsign = order.car?.callsign?.trim() ?? null;
    const mergeKey = orderDriverId
      ? resolveContractorMergeKey(orderDriverId, driverIdToContractor, profileRows) || `fleet-order-${order.id}`
      : `fleet-order-${order.id}`;
    const existing = driversById.get(mergeKey);
    const track = includeGeo ? trackByOrder.get(order.id) ?? [] : [];
    const lastPoint = track.length ? track[track.length - 1] : null;
    const pointGeo = readLatLonFromTrackPoint(lastPoint);
    let lat = pointGeo?.lat ?? null;
    let lon = pointGeo?.lon ?? null;
    let geoSource: DriverGeoDebugEvent["source"] = lat != null && lon != null ? "track" : "missing";
    /** Без точки в треке не затираем lat/lon из профиля/предыдущего снимка. */
    if ((lat == null || lon == null) && existing?.lat != null && existing?.lon != null) {
      lat = existing.lat;
      lon = existing.lon;
      geoSource = "carry";
    }
    const statusRaw = lastPoint?.order_status ?? order.status;
    const normalizedStatus = (statusRaw ?? "").toLowerCase();
    const hasGps = typeof lat === "number" && typeof lon === "number";
    const mappedStatus = mapOrderStatusToDriverMapStatus(normalizedStatus, hasGps, includeGeo);
    const busyMinutes = toBusyMinutes(order.booked_at ?? order.created_at);
    const statusHistory24h = buildStatusHistory24h(track, mappedStatus);
    if (existing && existing.lastTrackedAt && lastPoint?.tracked_at) {
      const oldMs = new Date(existing.lastTrackedAt).getTime();
      const newMs = new Date(lastPoint.tracked_at).getTime();
      if (!Number.isNaN(oldMs) && !Number.isNaN(newMs) && oldMs > newMs) {
        continue;
      }
    }
    if (existing) {
      const currentRank =
        existing.status === "active_trip" ? 4 : existing.status === "busy" ? 3 : existing.status === "available" ? 2 : 1;
      const nextRank =
        mappedStatus === "active_trip" ? 4 : mappedStatus === "busy" ? 3 : mappedStatus === "available" ? 2 : 1;
      if (nextRank < currentRank) {
        continue;
      }
    }

    const nameFromOrder = pickRicherName(
      order.driver_profile?.name?.trim() ?? null,
      existing?.name ?? null,
      `Driver ${mergeKey.slice(0, 6)}`,
    );
    driversById.set(mergeKey, {
      id: mergeKey,
      name: nameFromOrder,
      partnerId,
      partnerName,
      phone: existing?.phone ?? null,
      carNumber: carNumber ?? existing?.carNumber ?? null,
      callsign: callsign ?? existing?.callsign ?? null,
      status: mappedStatus,
      busyMinutes,
      busyLabel: formatBusyLabel(busyMinutes, mappedStatus),
      lat,
      lon,
      lastTrackedAt: lastPoint?.tracked_at ?? existing?.lastTrackedAt ?? null,
      orderId: order.id,
      source: "fleet",
      statusHistory24h,
      supplyDurationSeconds: existing?.supplyDurationSeconds,
    });
    geoSourceByDriver.set(mergeKey, geoSource);
  }
}

function sortOrdersForTrackFetch(orders: NonNullable<FleetOrdersListResponse["orders"]>): NonNullable<
  FleetOrdersListResponse["orders"]
> {
  const priority = (status: string | undefined): number => {
    const s = (status ?? "").toLowerCase();
    if (s === "transporting" || s === "in_order" || s === "on_order") return 3;
    if (s === "driving") return 2;
    if (s === "waiting") return 1;
    return 0;
  };
  return [...orders].sort((a, b) => {
    const d = priority(b.status) - priority(a.status);
    if (d !== 0) return d;
    const tb = new Date(b.booked_at ?? b.created_at ?? 0).getTime();
    const ta = new Date(a.booked_at ?? a.created_at ?? 0).getTime();
    return tb - ta;
  });
}

async function loadFleetDrivers(options?: {
  includeGeo?: boolean;
  force?: boolean;
}): Promise<{ drivers: DriverMapItem[]; geoSourceByDriver: Map<string, DriverGeoDebugEvent["source"]> }> {
  const includeGeo = options?.includeGeo !== false;
  const force = options?.force === true;
  const now = new Date();
  const since = new Date(now.getTime() - FLEET_ACTIVE_WINDOW_MS);
  const supplyFrom = new Date(now.getTime() - STATUS_HISTORY_WINDOW_MS).toISOString();
  const supplyTo = now.toISOString();

  let profileRows: DriverProfileRow[] = [];
  if (!force && driverProfilesCache && Date.now() - driverProfilesCache.at < FLEET_PROFILES_CACHE_TTL_MS) {
    profileRows = driverProfilesCache.rows;
  } else {
    try {
      profileRows = await fetchAllDriverProfileRows();
      driverProfilesCache = { at: Date.now(), rows: profileRows };
    } catch {
      profileRows = driverProfilesCache?.rows ?? [];
    }
  }

  const driverIdToContractor = new Map<string, string>();
  for (const p of profileRows) {
    driverIdToContractor.set(p.driverProfileId, p.contractorProfileId);
    driverIdToContractor.set(p.contractorProfileId, p.contractorProfileId);
  }

  const orders = await fetchFleetOrdersWindow({
    fromIso: since.toISOString(),
    toIso: now.toISOString(),
  });
  const trackByOrder = new Map<string, FleetTrackResponse["track"]>();
  if (includeGeo && orders.length) {
    const ordersForTrack = sortOrdersForTrackFetch(orders).slice(0, FLEET_TRACK_MAX_ORDERS);
    const tracks = await Promise.all(
      ordersForTrack.map(async (order) => {
        try {
          const track = await fetchOrderTrack(order.id);
          return { orderId: order.id, track: track.track ?? [] };
        } catch {
          return { orderId: order.id, track: [] };
        }
      }),
    );
    for (const item of tracks) trackByOrder.set(item.orderId, item.track);
  }

  const driversById = new Map<string, DriverMapItem>();
  const geoSourceByDriver = new Map<string, DriverGeoDebugEvent["source"]>();

  if (profileRows.length) {
    const ids = profileRows.map((p) => p.contractorProfileId);
    const supplyMap = await buildSupplyMap(ids, supplyFrom, supplyTo, { force });
    for (const p of profileRows) {
      const sec = supplyMap.get(p.contractorProfileId) ?? 0;
      const partnerId = FLEET_PARK_ID || null;
      const hasGps = p.profileLat != null && p.profileLon != null;
      const { status: baseStatus, busyLabel } = deriveIdleDriverMapStatus(
        p.workStatus,
        p.currentStatus,
        sec,
        hasGps,
      );
      driversById.set(p.contractorProfileId, {
        id: p.contractorProfileId,
        name: p.name,
        partnerId,
        partnerName: DEFAULT_FLEET_PARTNER_NAME,
        phone: p.phone,
        carNumber: p.carNumber,
        callsign: p.callsign,
        status: baseStatus,
        busyMinutes: null,
        busyLabel,
        lat: p.profileLat,
        lon: p.profileLon,
        lastTrackedAt: null,
        orderId: null,
        source: "fleet",
        statusHistory24h: [{ status: baseStatus, at: new Date().toISOString() }],
        supplyDurationSeconds: sec,
      });
      geoSourceByDriver.set(p.contractorProfileId, hasGps ? "profile" : "missing");
    }
  }

  if (orders.length) {
    applyActiveOrdersToDrivers(
      driversById,
      geoSourceByDriver,
      driverIdToContractor,
      profileRows,
      orders,
      includeGeo,
      trackByOrder,
    );
  }

  if (driversById.size > 0) {
    return { drivers: [...driversById.values()], geoSourceByDriver };
  }
  if (!orders.length) {
    return { drivers: [], geoSourceByDriver };
  }
  for (const order of orders) {
    const driverId = order.driver_profile?.id?.trim();
    const partnerId = order.park_details?.company?.id?.trim() || FLEET_PARK_ID || null;
    const partnerName = order.park_details?.company?.name?.trim() || DEFAULT_FLEET_PARTNER_NAME;
    const carNumber = order.car?.license?.number?.trim() ?? null;
    const callsign = order.car?.callsign?.trim() ?? null;
    const key = driverId || `fleet-order-${order.id}`;
    const existing = driversById.get(key);
    const track = includeGeo ? trackByOrder.get(order.id) ?? [] : [];
    const lastPoint = track.length ? track[track.length - 1] : null;
    const pointGeo = readLatLonFromTrackPoint(lastPoint);
    let lat = pointGeo?.lat ?? null;
    let lon = pointGeo?.lon ?? null;
    let geoSource: DriverGeoDebugEvent["source"] = lat != null && lon != null ? "track" : "missing";
    if ((lat == null || lon == null) && existing?.lat != null && existing?.lon != null) {
      lat = existing.lat;
      lon = existing.lon;
      geoSource = "carry";
    }
    const statusRaw = lastPoint?.order_status ?? order.status;
    const normalizedStatus = (statusRaw ?? "").toLowerCase();
    const hasGps = typeof lat === "number" && typeof lon === "number";
    const mappedStatus = mapOrderStatusToDriverMapStatus(normalizedStatus, hasGps, includeGeo);
    const busyMinutes = toBusyMinutes(order.booked_at ?? order.created_at);
    const statusHistory24h = buildStatusHistory24h(track, mappedStatus);
    if (existing && existing.lastTrackedAt && lastPoint?.tracked_at) {
      const oldMs = new Date(existing.lastTrackedAt).getTime();
      const newMs = new Date(lastPoint.tracked_at).getTime();
      if (!Number.isNaN(oldMs) && !Number.isNaN(newMs) && oldMs > newMs) {
        continue;
      }
    }
    if (existing) {
      const currentRank =
        existing.status === "active_trip" ? 4 : existing.status === "busy" ? 3 : existing.status === "available" ? 2 : 1;
      const nextRank =
        mappedStatus === "active_trip" ? 4 : mappedStatus === "busy" ? 3 : mappedStatus === "available" ? 2 : 1;
      if (nextRank < currentRank) {
        continue;
      }
    }
    driversById.set(key, {
      id: key,
      name: order.driver_profile?.name?.trim() || `Driver ${key.slice(0, 6)}`,
      partnerId,
      partnerName,
      phone: null,
      carNumber,
      callsign,
      status: mappedStatus,
      busyMinutes,
      busyLabel: formatBusyLabel(busyMinutes, mappedStatus),
      lat,
      lon,
      lastTrackedAt: lastPoint?.tracked_at ?? existing?.lastTrackedAt ?? null,
      orderId: order.id,
      source: "fleet",
      statusHistory24h,
    });
    geoSourceByDriver.set(key, geoSource);
  }
  return { drivers: [...driversById.values()], geoSourceByDriver };
}

export async function getFleetApiPartners(): Promise<FleetPartnerRef[]> {
  if (!FLEET_API_KEY || !FLEET_CLIENT_ID || !FLEET_PARK_ID) {
    return [];
  }
  /** Single configured park — avoids an extra `orders/list` call (major 429 contributor). */
  return [{ id: FLEET_PARK_ID, name: DEFAULT_FLEET_PARTNER_NAME }];
}

export async function getDriversOnMapData(): Promise<DriversMapResponse> {
  return getDriversOnMapDataOptimized({ includeGeo: true });
}

function hydrateSnapshotDriversForResponse(): DriverMapItem[] {
  if (!lastGoodDriversSnapshot) return [];
  const merged = mergeGeoForDisplay(
    lastGoodDriversSnapshot.drivers,
    lastGoodDriversSnapshot.drivers,
  );
  return hydrateDriversWithObservations(merged);
}

export async function getDriversOnMapDataOptimized(input: {
  includeGeo: boolean;
  force?: boolean;
  debug?: boolean;
}): Promise<DriversMapResponse> {
  await ensureSnapshotLoadedFromDisk();
  const updatedAt = new Date().toISOString();
  if (!FLEET_API_KEY || !FLEET_CLIENT_ID || !FLEET_PARK_ID) {
    return {
      ok: false,
      source: "fleet",
      updatedAt,
      drivers: [],
      counters: buildCounters([]),
      message: "Fleet API credentials are not configured.",
    };
  }

  const now = Date.now();
  const minFetchIntervalMs = input.includeGeo
    ? FLEET_MIN_GEO_FETCH_INTERVAL_MS
    : FLEET_MIN_STATUS_FETCH_INTERVAL_MS;

  if (
    !input.force &&
    input.includeGeo &&
    lastGoodDriversSnapshot &&
    now - lastGoodSnapshotAtMs < FLEET_MAP_CACHE_TTL_MS
  ) {
    const drivers = hydrateSnapshotDriversForResponse();
    await appendObservationsAndRecordFleetGeo(drivers, input.includeGeo, new Map());
    return {
      ok: true,
      source: lastGoodDriversSnapshot.source,
      updatedAt,
      drivers,
      counters: buildCounters(drivers),
      message: "Using cached Fleet snapshot.",
      ...maybeDebugGeoPayload(drivers, input.debug),
    };
  }

  if (
    !input.force &&
    !input.includeGeo &&
    lastGoodDriversSnapshot &&
    now - lastGoodSnapshotAtMs < FLEET_STATUS_CACHE_TTL_MS
  ) {
    const drivers = hydrateSnapshotDriversForResponse();
    await appendObservationsAndRecordFleetGeo(drivers, input.includeGeo, new Map());
    return {
      ok: true,
      source: lastGoodDriversSnapshot.source,
      updatedAt,
      drivers,
      counters: buildCounters(drivers),
      message: "Using cached Fleet status snapshot.",
      ...maybeDebugGeoPayload(drivers, input.debug),
    };
  }

  if (!input.force && lastGoodDriversSnapshot && now - lastFleetFetchAtMs < minFetchIntervalMs) {
    const drivers = hydrateSnapshotDriversForResponse();
    await appendObservationsAndRecordFleetGeo(drivers, input.includeGeo, new Map());
    return {
      ok: true,
      source: lastGoodDriversSnapshot.source,
      updatedAt,
      drivers,
      counters: buildCounters(drivers),
      message: "Using throttled Fleet snapshot.",
      ...maybeDebugGeoPayload(drivers, input.debug),
    };
  }

  if (!input.force && input.includeGeo && now < fleetRateLimitedUntilMs && lastGoodDriversSnapshot) {
    const drivers = hydrateSnapshotDriversForResponse();
    await appendObservationsAndRecordFleetGeo(drivers, input.includeGeo, new Map());
    return {
      ok: true,
      source: lastGoodDriversSnapshot.source,
      updatedAt,
      drivers,
      counters: buildCounters(drivers),
      message: "Fleet API rate-limited. Showing cached drivers snapshot.",
      ...maybeDebugGeoPayload(drivers, input.debug),
    };
  }

  try {
    lastFleetFetchAtMs = now;
    const { drivers: fetchedDrivers, geoSourceByDriver } = await loadFleetDrivers({
      includeGeo: input.includeGeo,
      force: input.force,
    });
    const geoMerged = mergeGeoForDisplay(fetchedDrivers, lastGoodDriversSnapshot?.drivers);
    const hydratedDrivers = hydrateDriversWithObservations(geoMerged);
    await appendObservationsAndRecordFleetGeo(hydratedDrivers, input.includeGeo, geoSourceByDriver, {
      skipThrottledKvPersist: true,
    });
    const drivers = hydratedDrivers;
    const source: DriversMapResponse["source"] = "fleet";
    const counters = buildCounters(drivers);
    if (drivers.length > 0) {
      lastGoodDriversSnapshot = {
        updatedAt,
        source,
        drivers,
        counters,
      };
      lastGoodSnapshotAtMs = now;
      await persistFleetSnapshot(lastGoodDriversSnapshot);
    } else if (lastGoodDriversSnapshot) {
      const drivers = hydrateSnapshotDriversForResponse();
      await appendObservationsAndRecordFleetGeo(drivers, input.includeGeo, new Map());
      return {
        ok: true,
        source: lastGoodDriversSnapshot.source,
        updatedAt,
        drivers,
        counters: buildCounters(drivers),
        message: "Fleet returned no active drivers. Showing last live snapshot.",
        ...maybeDebugGeoPayload(drivers, input.debug),
      };
    }
    return {
      ok: true,
      source,
      updatedAt,
      drivers,
      counters,
      message: drivers.length ? undefined : "Fleet returned no active drivers.",
      ...maybeDebugGeoPayload(drivers, input.debug),
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Fleet API unavailable.";
    if (errorMessage.includes("HTTP 429")) {
      fleetRateLimitedUntilMs = Date.now() + FLEET_RATE_LIMIT_COOLDOWN_MS;
      if (lastGoodDriversSnapshot) {
        const drivers = hydrateSnapshotDriversForResponse();
        await appendObservationsAndRecordFleetGeo(drivers, input.includeGeo, new Map());
        return {
          ok: true,
          source: lastGoodDriversSnapshot.source,
          updatedAt,
          drivers,
          counters: buildCounters(drivers),
          message: "Fleet API rate limit exceeded. Showing cached drivers snapshot.",
          ...maybeDebugGeoPayload(drivers, input.debug),
        };
      }
      return {
        ok: true,
        source: "fleet",
        updatedAt,
        drivers: [],
        counters: buildCounters([]),
        message:
          "Fleet API rate limit exceeded. No snapshot yet — wait a few minutes or ask Yango to raise API limits.",
      };
    }
    return {
      ok: false,
      source: "fleet",
      updatedAt,
      drivers: [],
      counters: buildCounters([]),
      message: `Fleet API unavailable: ${errorMessage}`,
    };
  }
}
