import { getTelephonyProviderName, isTelephonyEnabled } from "@/lib/telephony/env";
import type { TelephonyProvider } from "@/lib/telephony/provider";
import { createAstradialTelephonyProvider } from "@/lib/telephony/providers/astradial";

export function getTelephonyProvider(): TelephonyProvider | null {
  if (!isTelephonyEnabled()) return null;
  const name = getTelephonyProviderName();
  if (name === "astradial") {
    const provider = createAstradialTelephonyProvider();
    return provider.isConfigured() ? provider : null;
  }
  // threecx remains on legacy /api/sales-operation/call-center/* routes for now
  return null;
}
