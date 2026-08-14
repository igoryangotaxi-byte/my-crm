"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { AiPageContext } from "@/lib/ai/types";

const AiPageContextValue = createContext<AiPageContext>({});

export function AiPageContextProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const value = useMemo<AiPageContext>(() => {
    const lead = search.get("lead");
    const clientMatch = pathname.match(/^\/sales-operation\/b2b-clients\/([^/]+)/);
    const trackerMatch = pathname.match(/^\/sales-operation\/tracker\/([^/]+)/);
    return {
      page: pathname,
      entityType: lead ? "lead" : clientMatch ? "client" : trackerMatch ? "trackerProject" : null,
      entityId: lead || clientMatch?.[1] || trackerMatch?.[1] || null,
    };
  }, [pathname, search]);
  return <AiPageContextValue.Provider value={value}>{children}</AiPageContextValue.Provider>;
}

export function useAiPageContext(): AiPageContext {
  return useContext(AiPageContextValue);
}
