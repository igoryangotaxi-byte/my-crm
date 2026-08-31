/**
 * Pure helpers for Yango orders/change-destinations payload shaping.
 * geopoint is always [lon, lat] per Yango B2B API.
 */

export type YangoRoutePoint = {
  fullname: string;
  geopoint: [number, number];
  lat: number;
  lon: number;
};

export type YangoOrderRouteSnapshot = {
  orderId: string;
  status: string | null;
  driverAssigned: boolean;
  source: YangoRoutePoint | null;
  interimDestinations: YangoRoutePoint[];
  destination: YangoRoutePoint | null;
  /** Full destinations tail for change-destinations (interims + final). Never includes source. */
  destinations: YangoRoutePoint[];
};

export type ChangeDestinationPointInput = {
  fullname: string;
  lat: number;
  lon: number;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function readYangoGeopoint(value: unknown): { lat: number; lon: number } | null {
  if (!value) return null;
  if (Array.isArray(value) && value.length >= 2) {
    const lon = asNumberOrNull(value[0]);
    const lat = asNumberOrNull(value[1]);
    if (lat != null && lon != null) return { lat, lon };
  }
  if (typeof value === "object") {
    const row = value as Record<string, unknown>;
    const lon = asNumberOrNull(row.lon ?? row.longitude ?? row.lng);
    const lat = asNumberOrNull(row.lat ?? row.latitude);
    if (lat != null && lon != null) return { lat, lon };
  }
  return null;
}

export function toYangoRoutePoint(
  fullname: string,
  lat: number,
  lon: number,
): YangoRoutePoint {
  return {
    fullname: fullname.trim(),
    lat,
    lon,
    geopoint: [lon, lat],
  };
}

export function parseYangoRoutePoint(raw: unknown): YangoRoutePoint | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const fullname = asString(row.fullname) || asString(row.address) || asString(row.name);
  const point = readYangoGeopoint(row.geopoint ?? row.point ?? row);
  if (!fullname || !point) return null;
  return toYangoRoutePoint(fullname, point.lat, point.lon);
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function pickPointField(
  root: Record<string, unknown>,
  key: string,
): unknown {
  if (root[key] != null) return root[key];
  const info = asObject(root.info);
  if (info?.[key] != null) return info[key];
  const report = asObject(root.report);
  if (report?.[key] != null) return report[key];
  return null;
}

/**
 * Build a route snapshot from a Yango orders/info (or similar) payload.
 */
export function parseYangoOrderRoute(
  orderId: string,
  payload: Record<string, unknown> | null | undefined,
): YangoOrderRouteSnapshot {
  const root = payload ?? {};
  const source = parseYangoRoutePoint(pickPointField(root, "source"));
  const destination = parseYangoRoutePoint(pickPointField(root, "destination"));

  const interimRaw =
    pickPointField(root, "interim_destinations") ??
    pickPointField(root, "interimDestinations") ??
    [];
  const interimList = Array.isArray(interimRaw) ? interimRaw : [];
  const interimDestinations = interimList
    .map((item) => parseYangoRoutePoint(item))
    .filter((item): item is YangoRoutePoint => Boolean(item));

  const destinations: YangoRoutePoint[] = [...interimDestinations];
  if (destination) destinations.push(destination);

  const performer = asObject(root.performer) ?? asObject(asObject(root.info)?.performer);
  const driverAssigned = Boolean(
    performer &&
      (asString(performer.fullname) ||
        asString(performer.phone) ||
        asString(performer.id) ||
        asString(performer.name)),
  );

  const status =
    asString(root.status) ||
    asString(asObject(root.info)?.status) ||
    null;

  return {
    orderId,
    status: status || null,
    driverAssigned,
    source,
    interimDestinations,
    destination,
    destinations,
  };
}

/**
 * Replace one interim stop (by index) and keep remaining interims + final destination.
 * Does not include source.
 */
export function patchInterimDestination(
  route: YangoOrderRouteSnapshot,
  interimIndex: number,
  next: ChangeDestinationPointInput,
): YangoRoutePoint[] {
  if (!Number.isInteger(interimIndex) || interimIndex < 0) {
    throw new Error("interimIndex must be a non-negative integer.");
  }
  if (interimIndex >= route.interimDestinations.length) {
    throw new Error(
      `interimIndex ${interimIndex} is out of range (order has ${route.interimDestinations.length} interim stop(s)).`,
    );
  }
  if (!route.destination) {
    throw new Error("Order has no final destination; cannot build destinations payload.");
  }
  const address = next.fullname.trim();
  if (!address) throw new Error("Replacement address is required.");
  if (!Number.isFinite(next.lat) || !Number.isFinite(next.lon)) {
    throw new Error("Replacement lat/lon are required.");
  }

  const interims = route.interimDestinations.map((point, index) =>
    index === interimIndex ? toYangoRoutePoint(address, next.lat, next.lon) : point,
  );
  return [...interims, route.destination];
}

/** Append a new intermediate stop before the final destination. */
export function appendInterimDestination(
  route: YangoOrderRouteSnapshot,
  next: ChangeDestinationPointInput,
): YangoRoutePoint[] {
  if (!route.destination) {
    throw new Error("Order has no final destination; cannot build destinations payload.");
  }
  const address = next.fullname.trim();
  if (!address) throw new Error("Stop address is required.");
  if (!Number.isFinite(next.lat) || !Number.isFinite(next.lon)) {
    throw new Error("Stop lat/lon are required.");
  }
  return [
    ...route.interimDestinations,
    toYangoRoutePoint(address, next.lat, next.lon),
    route.destination,
  ];
}

export function destinationsToApiBody(destinations: YangoRoutePoint[]) {
  return destinations.map((point) => ({
    fullname: point.fullname,
    geopoint: point.geopoint,
  }));
}

/** Format created_time for change-destinations (keeps timezone offset when possible). */
export function formatChangeDestinationsCreatedTime(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const offsetMin = -date.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  const oh = pad(Math.floor(abs / 60));
  const om = pad(abs % 60);
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${oh}:${om}`
  );
}

export function isTerminalOrderStatus(status: string | null | undefined): boolean {
  const s = (status ?? "").toLowerCase();
  if (!s) return false;
  return (
    s.includes("cancel") ||
    s === "complete" ||
    s === "completed" ||
    s === "finished" ||
    s === "transporting_finished"
  );
}
