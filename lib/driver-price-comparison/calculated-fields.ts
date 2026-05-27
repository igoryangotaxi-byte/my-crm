export type DifferenceFlag =
  | "No difference"
  | "Driver price higher"
  | "Mone price higher"
  | "No price";

export type DistanceBucket = "0-3 km" | "3-5 km" | "5-10 km" | "10-20 km" | "20+ km";

export const DAY_OF_WEEK_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export type DayOfWeekLabel = (typeof DAY_OF_WEEK_LABELS)[number];

export const DIFFERENCE_FLAGS: DifferenceFlag[] = [
  "No difference",
  "Driver price higher",
  "Mone price higher",
  "No price",
];

/** Flags shown in analytics charts (excludes unsuccessful no-price trips). */
export const ANALYTICS_DIFFERENCE_FLAGS: DifferenceFlag[] = DIFFERENCE_FLAGS.filter(
  (flag) => flag !== "No price",
);

export const DISTANCE_BUCKETS: DistanceBucket[] = [
  "0-3 km",
  "3-5 km",
  "5-10 km",
  "10-20 km",
  "20+ km",
];

const JERUSALEM_TZ = "Asia/Jerusalem";
const NO_DIFFERENCE_THRESHOLD_NIS = 0.5;
export const DRIVER_PRICE_HIGHER_PROBLEMATIC_MIN_NIS = 10;

export type ComparisonBaseRow = {
  order_id: string;
  order_date: string;
  corp_client_id?: string | null;
  client_price?: number | null;
  driver_price_with_vat: number;
  actual_km?: number | null;
  actual_minutes?: number | null;
  mone_price: number;
};

export type ComparisonEnrichedRow = ComparisonBaseRow & {
  order_time: string;
  day_of_week: DayOfWeekLabel;
  hour: number;
  distance_km: number | null;
  time_min: number | null;
  difference_nis: number;
  difference_percent: number | null;
  absolute_difference_nis: number;
  difference_flag: DifferenceFlag;
  distance_bucket: DistanceBucket | null;
};

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function getJerusalemParts(isoDate: string) {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: JERUSALEM_TZ,
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Sunday";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  return {
    dayOfWeek: weekday as DayOfWeekLabel,
    hour: Number.isFinite(hour) ? hour : 0,
    orderTime: `${String(hour).padStart(2, "0")}:${minute}`,
  };
}

export function computeDifferenceNis(driverPriceWithVat: number, monePrice: number) {
  return driverPriceWithVat - monePrice;
}

export function computeDifferencePercent(driverPriceWithVat: number, monePrice: number) {
  if (monePrice <= 0) return null;
  return (computeDifferenceNis(driverPriceWithVat, monePrice) / monePrice) * 100;
}

export function computeAbsoluteDifferenceNis(driverPriceWithVat: number, monePrice: number) {
  return Math.abs(computeDifferenceNis(driverPriceWithVat, monePrice));
}

export function isNoPriceTrip(
  driverPriceWithVat: number,
  km: number | null | undefined,
  minutes: number | null | undefined,
) {
  const kmValue = toFiniteNumber(km) ?? 0;
  const minutesValue = toFiniteNumber(minutes) ?? 0;
  return driverPriceWithVat === 0 && kmValue === 0 && minutesValue === 0;
}

export function isComparableRide(row: Pick<ComparisonEnrichedRow, "difference_flag">) {
  return row.difference_flag !== "No price";
}

export function isTopProblematicDriverPriceHigher(
  row: Pick<ComparisonEnrichedRow, "difference_flag" | "absolute_difference_nis">,
) {
  return (
    row.difference_flag === "Driver price higher" &&
    row.absolute_difference_nis > DRIVER_PRICE_HIGHER_PROBLEMATIC_MIN_NIS
  );
}

export function computeDifferenceFlag(
  driverPriceWithVat: number,
  monePrice: number,
  km?: number | null,
  minutes?: number | null,
): DifferenceFlag {
  if (isNoPriceTrip(driverPriceWithVat, km, minutes)) {
    return "No price";
  }
  const diff = computeDifferenceNis(driverPriceWithVat, monePrice);
  if (Math.abs(diff) < NO_DIFFERENCE_THRESHOLD_NIS) {
    return "No difference";
  }
  if (driverPriceWithVat > monePrice) {
    return "Driver price higher";
  }
  return "Mone price higher";
}

export function computeDistanceBucket(km: number | null | undefined): DistanceBucket | null {
  const value = toFiniteNumber(km);
  if (value === null || value < 0) return null;
  if (value < 3) return "0-3 km";
  if (value < 5) return "3-5 km";
  if (value < 10) return "5-10 km";
  if (value < 20) return "10-20 km";
  return "20+ km";
}

export function enrichComparisonRow(row: ComparisonBaseRow): ComparisonEnrichedRow | null {
  const driverPrice = toFiniteNumber(row.driver_price_with_vat);
  const monePrice = toFiniteNumber(row.mone_price);
  if (driverPrice === null || monePrice === null) return null;

  const jerusalem = getJerusalemParts(row.order_date);
  if (!jerusalem) return null;

  const distanceKm = toFiniteNumber(row.actual_km);
  const timeMin = toFiniteNumber(row.actual_minutes);
  const differenceNis = computeDifferenceNis(driverPrice, monePrice);

  return {
    ...row,
    driver_price_with_vat: driverPrice,
    mone_price: monePrice,
    order_time: jerusalem.orderTime,
    day_of_week: jerusalem.dayOfWeek,
    hour: jerusalem.hour,
    distance_km: distanceKm,
    time_min: timeMin,
    difference_nis: differenceNis,
    difference_percent: computeDifferencePercent(driverPrice, monePrice),
    absolute_difference_nis: Math.abs(differenceNis),
    difference_flag: computeDifferenceFlag(driverPrice, monePrice, distanceKm, timeMin),
    distance_bucket: computeDistanceBucket(row.actual_km),
  };
}

export function mapDbEnrichedRow(row: Record<string, unknown>): ComparisonEnrichedRow | null {
  const orderId = typeof row.order_id === "string" ? row.order_id : "";
  const orderDate = typeof row.order_date === "string" ? row.order_date : "";
  const driverPrice = toFiniteNumber(row.driver_price_with_vat);
  const monePrice = toFiniteNumber(row.mone_price);
  if (!orderId || !orderDate || driverPrice === null || monePrice === null) {
    return null;
  }

  const dayOfWeek =
    typeof row.day_of_week === "string"
      ? (row.day_of_week.trim() as DayOfWeekLabel)
      : getJerusalemParts(orderDate)?.dayOfWeek ?? "Sunday";

  const distanceKm = toFiniteNumber(row.distance_km ?? row.actual_km);
  const timeMin = toFiniteNumber(row.time_min ?? row.actual_minutes);

  return {
    order_id: orderId,
    order_date: orderDate,
    corp_client_id: typeof row.corp_client_id === "string" ? row.corp_client_id : null,
    client_price: toFiniteNumber(row.client_price),
    driver_price_with_vat: driverPrice,
    actual_km: distanceKm,
    actual_minutes: timeMin,
    mone_price: monePrice,
    order_time: typeof row.order_time === "string" ? row.order_time : "",
    day_of_week: dayOfWeek,
    hour: toFiniteNumber(row.hour) ?? 0,
    distance_km: distanceKm,
    time_min: timeMin,
    difference_nis: toFiniteNumber(row.difference_nis) ?? computeDifferenceNis(driverPrice, monePrice),
    difference_percent:
      toFiniteNumber(row.difference_percent) ?? computeDifferencePercent(driverPrice, monePrice),
    absolute_difference_nis:
      toFiniteNumber(row.absolute_difference_nis) ??
      computeAbsoluteDifferenceNis(driverPrice, monePrice),
    difference_flag: computeDifferenceFlag(driverPrice, monePrice, distanceKm, timeMin),
    distance_bucket:
      typeof row.distance_bucket === "string"
        ? (row.distance_bucket as DistanceBucket)
        : computeDistanceBucket(distanceKm),
  };
}
