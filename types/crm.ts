export type ClientStatus = "active" | "lead" | "inactive";
export type OrderStatus = "paid" | "pending" | "overdue";

export type Client = {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  status: ClientStatus;
  totalRevenue: number;
};

export type Order = {
  id: string;
  clientId: string;
  clientName: string;
  title: string;
  amount: number;
  status: OrderStatus;
  createdAt: string;
};

export type PreOrder = {
  id: string;
  /** API context for cancel / status calls */
  tokenLabel: string;
  clientId: string;
  orderId: string;
  orderStatus?: string;
  clientPrice: string;
  clientName: string;
  requestedAt: string;
  scheduledFor: string;
  scheduledAt?: string;
  pointA: string;
  pointB: string;
  driverAssigned: boolean;
  driverId: string | null;
  driverFirstName: string | null;
  driverLastName: string | null;
  driverPhone: string | null;
  fallback?: PreOrderFallbackSnapshot | null;
};

export type PreOrderFallbackStatus =
  | "idle"
  | "skipped"
  | "in_progress"
  | "failed"
  | "completed";

export type PreOrderFallbackSnapshot = {
  status: PreOrderFallbackStatus;
  reason: string | null;
  attempts: number;
  lastAttemptAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  fallbackOrderId: string | null;
  sourceOrderId: string;
  thresholdMinutes: number;
};

export type Kpi = {
  id: string;
  label: string;
  value: string;
  trend: string;
};

export type TokenDiagnostics = {
  label: string;
  tokenLabel: string;
  clientId: string | null;
  clientName: string | null;
  authStatus: "ok" | "error";
  ordersStatus: "ok" | "feature_disabled" | "error";
  message: string | null;
};

export type DashboardOrderStatus = "completed" | "cancelled" | "pending" | "in_progress";

export type B2BDashboardOrder = {
  orderId: string;
  tokenLabel: string;
  clientId: string | null;
  clientName: string;
  status: DashboardOrderStatus;
  statusRaw: string;
  createdAt: string;
  scheduledAt: string;
  pointA: string;
  pointB: string;
  clientPaid: number;
  driverReceived: number;
  decoupling: number;
};

export type B2BOrderDetailsResponse = {
  orderId: string;
  tokenLabel: string;
  clientId: string | null;
  fetchedAt: string;
  info: Record<string, unknown> | null;
  progress: Record<string, unknown> | null;
  report: Record<string, unknown> | null;
};

export type YangoApiClientRef = {
  tokenLabel: string;
  clientId: string;
  clientName: string;
};

export type RequestRidePayload = {
  tokenLabel: string;
  clientId: string;
  rideClass: string;
  userId?: string;
  costCenterId?: string | null;
  /** Display name from `/2.0/cost_centers` — some CORP builds validate `cost_center` together with ids. */
  costCenterDisplayName?: string | null;
  sourceAddress: string;
  destinationAddress: string;
  waypoints?: Array<{
    address: string;
    lat?: number;
    lon?: number;
  }>;
  sourceLat?: number;
  sourceLon?: number;
  destinationLat?: number;
  destinationLon?: number;
  phoneNumber: string;
  comment?: string | null;
  scheduleAtIso?: string | null;
};

export type RequestRideResult = {
  orderId: string;
  status: string;
  etaMinutes: number | null;
  warning?: string;
};

export type RequestRideLifecycleStatus =
  | "searching"
  | "driver_assigned"
  | "pickup"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "unknown";

export type RequestRideStatus = {
  orderId: string;
  tokenLabel: string;
  clientId: string;
  lifecycleStatus: RequestRideLifecycleStatus;
  statusRaw: string;
  statusText: string;
  fetchedAt: string;
  driverName: string | null;
  driverPhone: string | null;
  driverFirstName: string | null;
  driverLastName: string | null;
  carModel: string | null;
  carPlate: string | null;
  etaMinutes: number | null;
  info: Record<string, unknown> | null;
  progress: Record<string, unknown> | null;
  report: Record<string, unknown> | null;
};

export type RequestRideUserSuggestion = {
  userId: string;
  phone: string | null;
  fullName: string | null;
  source: "api" | "map";
};

export type DriverMapStatus = "available" | "active_trip" | "busy" | "no_gps";

export type DriverStatusHistoryEvent = {
  status: DriverMapStatus;
  at: string;
};

export type DriverGeoDebugEvent = {
  historyKey?: string;
  at: string;
  status: DriverMapStatus;
  includeGeo: boolean;
  source: "profile" | "track" | "carry" | "missing";
  lat: number | null;
  lon: number | null;
};

export type DriverMapItem = {
  id: string;
  name: string;
  partnerId: string | null;
  partnerName: string | null;
  phone: string | null;
  carNumber: string | null;
  callsign: string | null;
  status: DriverMapStatus;
  busyMinutes: number | null;
  busyLabel: string;
  lat: number | null;
  lon: number | null;
  lastTrackedAt: string | null;
  orderId: string | null;
  source: "fleet" | "fallback";
  statusHistory24h: DriverStatusHistoryEvent[];
  /** Optional: /v2/parks/contractors/supply-hours → supply_duration_seconds in the requested period */
  supplyDurationSeconds?: number | null;
};

export type FleetPartnerRef = {
  id: string;
  name: string;
};

export type DriversMapCounters = {
  available: number;
  activeTrip: number;
  busy: number;
  noGps: number;
  total: number;
};

export type DriversMapResponse = {
  ok: boolean;
  source: "fleet" | "fallback" | "hybrid";
  updatedAt: string;
  drivers: DriverMapItem[];
  counters: DriversMapCounters;
  message?: string;
  driverGeoDebug?: Record<string, DriverGeoDebugEvent[]>;
};

export type YangoSupabaseOrderMetric = {
  orderId: string;
  scheduledAt: string;
  clientId: string | null;
  corpClientId: string | null;
  clientName: string;
  decouplingFlg: boolean | null;
  statusRaw: string;
  successOrderFlag: boolean | null;
  userStatus: string | null;
  driverStatus: string | null;
  clientPaid: number;
  driverReceived: number;
  decoupling: number;
};

export type TariffHealthMetric =
  | "decoupling_rate"
  | "decoupling_abs"
  | "trips"
  | "client_spend"
  | "driver_cost"
  | "health_check";

export type TariffHealthPeriod = {
  fromIso: string;
  toIsoExclusive: string;
  label: string;
};

export type TariffHealthIntent = {
  metric: TariffHealthMetric;
  clientName?: string | null;
  corpClientId?: string | null;
  period: TariffHealthPeriod;
  targetDecouplingRatePct?: number | null;
};

export type TariffHealthSummary = {
  trips: number;
  clientSpend: number;
  driverCost: number;
  decouplingAbs: number;
  decouplingRatePct: number | null;
  avgClientSpendPerTrip: number | null;
  avgDriverCostPerTrip: number | null;
  /** Trips with km > 0 after normalization */
  ordersWithKm: number;
  avgKmPerTrip: number | null;
  kmP50: number | null;
  kmP75: number | null;
  kmP90: number | null;
};

/** One km segment: `km` null means all remaining distance on the trip. */
export type TariffKmBand = {
  km: number | null;
  ratePerKm: number;
};

export type TieredClientTariff = {
  basePrice: number;
  bands: TariffKmBand[];
};

export type ReferenceFlatTariffComparison = {
  label: string;
  basePrice: number;
  kmRate: number;
  simulatedTotal: number;
  simulatedAvgPerTrip: number;
  deltaVsActualTotal: number;
  deltaPctAvgVsActual: number | null;
};

export type TariffSuggestionMetrics = {
  simulatedTotal: number;
  simulatedAvgPerTrip: number;
  deltaVsActualTotal: number;
  deltaVsActualAvgPerTrip: number;
  deltaPctAvgVsActual: number | null;
  portfolioDecouplingRatePct: number | null;
  /** Sum of (simulatedDecoupling - actualDecoupling) where simulatedDecoupling = simulatedPrice - driverCost */
  incrementalDecouplingAbsTotal: number;
};

export type TariffSuggestion = {
  name: string;
  assumption: string;
  targetDecouplingRatePct: number;
  tariff: TieredClientTariff;
  metrics: TariffSuggestionMetrics;
};

export type TariffHealthResult = {
  ok: boolean;
  query: string;
  parsedIntent: TariffHealthIntent;
  resolvedClient: {
    corpClientIds: string[];
    clientName: string | null;
  };
  summary: TariffHealthSummary;
  referenceFlatTariff: ReferenceFlatTariffComparison | null;
  suggestions: TariffSuggestion[];
  assumptions: string[];
  /** Long-form analyst narrative (markdown-ish plain text); null if LLM unavailable */
  analystMarkdown?: string | null;
  warning?: string;
  error?: string;
};
