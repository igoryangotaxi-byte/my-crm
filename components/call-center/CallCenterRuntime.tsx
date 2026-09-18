"use client";

import type { ReactNode } from "react";
import { CallCenterLiveProvider } from "@/components/call-center/CallCenterLiveContext";
import { CallCenterScreenPop } from "@/components/call-center/CallCenterScreenPop";

/** Mount inside SO shell: polls 3CX legs and shows the inbound screen-pop drawer. */
export function CallCenterRuntime({ children }: { children: ReactNode }) {
  return (
    <CallCenterLiveProvider>
      {children}
      <CallCenterScreenPop />
    </CallCenterLiveProvider>
  );
}
