import type {
  DayOfWeekLabel,
  DifferenceFlag,
  DistanceBucket,
} from "@/lib/driver-price-comparison/calculated-fields";

export type ComparisonFilters = {
  since?: string | null;
  till?: string | null;
  dayOfWeek?: DayOfWeekLabel[];
  hour?: number[];
  distanceBucket?: DistanceBucket[];
  differenceFlag?: DifferenceFlag[];
  corpClientId?: string | null;
};

export type ComparisonKpis = {
  totalRides: number;
  ridesWithDifference: number;
  ridesWithDifferencePct: number;
  averageAbsoluteDifferenceNis: number;
  averageDifferencePercent: number;
  maxDifferenceNis: number;
  totalTaxiOrders: number;
  moneCoveragePct: number;
  p90AbsoluteDifferenceNis: number;
  p95AbsoluteDifferenceNis: number;
};

export type FrequencyByDayPoint = {
  dayOfWeek: DayOfWeekLabel;
  differenceFlag: DifferenceFlag;
  count: number;
};

export type SeverityByDayPoint = {
  dayOfWeek: DayOfWeekLabel;
  averageAbsoluteDifferenceNis: number;
};

export type HeatmapCell = {
  dayOfWeek: DayOfWeekLabel;
  hour: number;
  averageAbsoluteDifferenceNis: number;
  count: number;
};

export type DistanceBucketPoint = {
  distanceBucket: DistanceBucket;
  averageAbsoluteDifferenceNis: number;
  count: number;
};

export type ScatterPoint = {
  orderId: string;
  monePrice: number;
  driverPriceWithVat: number;
  distanceKm: number | null;
  differenceFlag: DifferenceFlag;
};

export type TrendPoint = {
  date: string;
  averageAbsoluteDifferenceNis: number;
  mismatchPct: number;
  count: number;
};

export type RankedBucket = {
  label: string;
  averageAbsoluteDifferenceNis: number;
  count: number;
};

export type ComparisonSummaryResponse = {
  ok: true;
  kpis: ComparisonKpis;
  frequencyByDay: FrequencyByDayPoint[];
  severityByDay: SeverityByDayPoint[];
  heatmap: HeatmapCell[];
  byDistance: DistanceBucketPoint[];
  scatterSample: ScatterPoint[];
  trendByDay: TrendPoint[];
  topProblematicHours: RankedBucket[];
  topProblematicWeekdays: RankedBucket[];
  anomalyCount: number;
  mismatchAlert: {
    active: boolean;
    currentMismatchPct: number;
    previousMismatchPct: number;
    deltaPctPoints: number;
  } | null;
};

export type ComparisonTableRow = {
  orderDate: string;
  orderTime: string;
  dayOfWeek: DayOfWeekLabel;
  distanceKm: number | null;
  timeMin: number | null;
  driverPriceWithVat: number;
  monePrice: number;
  differenceNis: number;
  differencePercent: number | null;
  differenceFlag: DifferenceFlag;
  orderId: string;
};

export type MoneImportPreviewRow = Record<string, string>;

export type MoneImportParseResponse = {
  ok: true;
  fileName: string;
  headers: string[];
  suggestedMapping: Record<string, string | null>;
  previewRows: MoneImportPreviewRow[];
  totalRows: number;
  validationErrors: string[];
  taxiOrdersCount?: number;
  estimatedOrderIdMatches?: number;
};

export type MoneImportCommitResponse = {
  ok: true;
  importId: string;
  totalRows: number;
  importedRows: number;
  skippedRows: number;
  errorRows: number;
  matchedRows: number;
  unmatchedRows: number;
  invalidRows: number;
  duplicateRowsInFile: number;
  rematchedRows: number;
  gpOrdersInCrm: number;
  errors: Array<{ rowIndex: number; message: string }>;
};

export type MoneImportHistoryItem = {
  id: string;
  fileName: string;
  uploadedAt: string;
  status: string;
  totalRows: number;
  importedRows: number;
  skippedRows: number;
  errorRows: number;
};
