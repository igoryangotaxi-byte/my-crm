"use client";

import type { ReactNode } from "react";
import { CallCenterLiveProvider } from "@/components/call-center/CallCenterLiveContext";
import { IncomingCallToast } from "@/components/call-center/IncomingCallToast";

/** Mount inside SO shell: polls 3CX legs and shows top-right inbound toast. */
export function CallCenterRuntime({ children }: { children: ReactNode }) {
  return (
    <CallCenterLiveProvider>
      {children}
      <IncomingCallToast />
    </CallCenterLiveProvider>
  );
}
