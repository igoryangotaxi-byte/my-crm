"use client";

import { TelephonyLiveProvider } from "@/components/telephony/TelephonyLiveContext";
import { GlobalCallPanel } from "@/components/telephony/GlobalCallPanel";

export function TelephonyRuntime({ children }: { children: React.ReactNode }) {
  return (
    <TelephonyLiveProvider>
      {children}
      <GlobalCallPanel />
    </TelephonyLiveProvider>
  );
}
