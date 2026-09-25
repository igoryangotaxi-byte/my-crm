import type { AppPageKey } from "@/types/auth";

/** Landing order matches `SalesOperationSidebar` nav (top to bottom). */
export const SALES_OPERATION_SIDEBAR_ROUTE_ORDER: Array<{ prefix: string; page: AppPageKey }> = [
  { prefix: "/sales-operation/tasks", page: "salesMySpace" },
  { prefix: "/sales-operation/calendar", page: "salesMySpace" },
  { prefix: "/sales-operation/pipeline", page: "salesPipeline" },
  { prefix: "/sales-operation/drivers-pipeline", page: "salesDriversPipeline" },
  { prefix: "/sales-operation/office", page: "salesPipeline" },
  { prefix: "/sales-operation/lead-discovery", page: "salesLeadDiscovery" },
  { prefix: "/sales-operation/tracker", page: "salesTracker" },
  { prefix: "/sales-operation/documentation", page: "salesDocumentation" },
  { prefix: "/sales-operation/portfolio", page: "salesSignedClients" },
  { prefix: "/sales-operation/b2b-clients", page: "salesB2BClients" },
  { prefix: "/sales-operation/analytics", page: "salesAnalytics" },
  { prefix: "/sales-operation/manager-analytics", page: "salesManagerAnalytics" },
  { prefix: "/sales-operation/performance", page: "salesSettings" },
  { prefix: "/sales-operation/automation", page: "salesAutomation" },
  { prefix: "/sales-operation/communications", page: "communications" },
  { prefix: "/sales-operation/pre-orders", page: "preOrders" },
  { prefix: "/sales-operation/request-rides", page: "requestRides" },
  { prefix: "/sales-operation/route-bundles", page: "preOrders" },
  { prefix: "/sales-operation/orders", page: "orders" },
  { prefix: "/sales-operation/price-calculator", page: "priceCalculator" },
  { prefix: "/sales-operation/api-health-check", page: "notes" },
  { prefix: "/sales-operation/call-center", page: "salesCallCenter" },
  { prefix: "/sales-operation/astradial", page: "salesAstradial" },
  { prefix: "/sales-operation/settings", page: "salesSettings" },
];
