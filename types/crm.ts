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
  sourceAddress: string;
  destinationAddress: string;
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
