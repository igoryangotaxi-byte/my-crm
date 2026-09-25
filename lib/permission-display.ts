import type { AppPageKey } from "@/types/auth";

/** next-intl keys under `permissions.*` for human-readable permission names. */
export const PERMISSION_I18N_KEY: Record<AppPageKey, string> = {
  dashboard: "dashboard",
  clients: "clients",
  orders: "orders",
  preOrders: "preOrders",
  requestRides: "requestRides",
  communications: "communications",
  financialCenter: "financialCenter",
  driversMap: "driversMap",
  heatMap: "heatMap",
  priceCalculator: "priceCalculator",
  salesOperation: "salesOperation",
  salesMySpace: "salesMySpace",
  salesPipeline: "salesPipeline",
  salesSignedClients: "salesSignedClients",
  salesB2BClients: "salesB2BClients",
  salesAnalytics: "salesAnalytics",
  salesManagerAnalytics: "salesManagerAnalytics",
  salesAutomation: "salesAutomation",
  salesSettings: "salesSettings",
  salesTracker: "salesTracker",
  salesDocumentation: "salesDocumentation",
  salesLeadDiscovery: "salesLeadDiscovery",
  salesAiAssistant: "salesAiAssistant",
  salesCallCenter: "salesCallCenter",
  salesAstradial: "salesAstradial",
  accesses: "accesses",
  notes: "notes",
};

export function permissionI18nKey(page: AppPageKey): string {
  return PERMISSION_I18N_KEY[page] ?? page;
}
