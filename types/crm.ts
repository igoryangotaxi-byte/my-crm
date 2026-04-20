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

export type DashboardOrderStatus = "completed" | "cancelled" | "pending";

export type B2BDashboardOrder = {
  orderId: string;
  tokenLabel: string;
  clientId: string | null;
  clientName: string;
  status: DashboardOrderStatus;
  statusRaw: string;
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
