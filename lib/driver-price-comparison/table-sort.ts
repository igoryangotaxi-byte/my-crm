import {
  DAY_OF_WEEK_LABELS,
  type ComparisonEnrichedRow,
} from "@/lib/driver-price-comparison/calculated-fields";
import type { ComparisonTableSortKey } from "@/lib/driver-price-comparison/types";

const DAY_ORDER = new Map(DAY_OF_WEEK_LABELS.map((day, index) => [day, index]));

function compareNumbers(a: number, b: number, direction: "asc" | "desc") {
  const diff = a - b;
  return direction === "asc" ? diff : -diff;
}

function compareNullableNumbers(
  a: number | null,
  b: number | null,
  direction: "asc" | "desc",
) {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return compareNumbers(a, b, direction);
}

function compareStrings(a: string, b: string, direction: "asc" | "desc") {
  const diff = a.localeCompare(b);
  return direction === "asc" ? diff : -diff;
}

export function sortComparisonRows(
  rows: ComparisonEnrichedRow[],
  sortKey: ComparisonTableSortKey,
  sortDirection: "asc" | "desc",
): ComparisonEnrichedRow[] {
  return [...rows].sort((a, b) => {
    switch (sortKey) {
      case "orderId":
        return compareStrings(a.order_id, b.order_id, sortDirection);
      case "orderDate":
        return compareStrings(a.order_date, b.order_date, sortDirection);
      case "orderTime":
        return compareStrings(a.order_time, b.order_time, sortDirection);
      case "dayOfWeek": {
        const left = DAY_ORDER.get(a.day_of_week) ?? 0;
        const right = DAY_ORDER.get(b.day_of_week) ?? 0;
        return compareNumbers(left, right, sortDirection);
      }
      case "distanceKm":
        return compareNullableNumbers(a.distance_km, b.distance_km, sortDirection);
      case "timeMin":
        return compareNullableNumbers(a.time_min, b.time_min, sortDirection);
      case "driverPriceWithVat":
        return compareNumbers(a.driver_price_with_vat, b.driver_price_with_vat, sortDirection);
      case "monePrice":
        return compareNumbers(a.mone_price, b.mone_price, sortDirection);
      case "differenceNis":
        return compareNumbers(a.absolute_difference_nis, b.absolute_difference_nis, sortDirection);
      case "differencePercent":
        return compareNullableNumbers(a.difference_percent, b.difference_percent, sortDirection);
      case "differenceFlag":
        return compareStrings(a.difference_flag, b.difference_flag, sortDirection);
      default:
        return compareNumbers(
          a.absolute_difference_nis,
          b.absolute_difference_nis,
          sortDirection === "asc" ? "asc" : "desc",
        );
    }
  });
}

export const COMPARISON_TABLE_COLUMNS: Array<{
  key: ComparisonTableSortKey;
  label: string;
}> = [
  { key: "orderId", label: "Order ID" },
  { key: "orderDate", label: "Date" },
  { key: "orderTime", label: "Time" },
  { key: "dayOfWeek", label: "Day" },
  { key: "distanceKm", label: "Km" },
  { key: "timeMin", label: "Min" },
  { key: "driverPriceWithVat", label: "Driver" },
  { key: "monePrice", label: "Mone" },
  { key: "differenceNis", label: "Diff NIS" },
  { key: "differencePercent", label: "Diff %" },
  { key: "differenceFlag", label: "Flag" },
];

const SORT_KEYS = new Set(COMPARISON_TABLE_COLUMNS.map((column) => column.key));

export function normalizeComparisonTableSortKey(value: unknown): ComparisonTableSortKey {
  return typeof value === "string" && SORT_KEYS.has(value as ComparisonTableSortKey)
    ? (value as ComparisonTableSortKey)
    : "differenceNis";
}
