"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";

type RouteLoadingContextValue = {
  isRouteLoading: boolean;
  startRouteLoading: () => void;
};

const RouteLoadingContext = createContext<RouteLoadingContextValue | null>(null);

export function RouteLoadingProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isRouteLoading, setIsRouteLoading] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  const clearPendingTimer = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const startRouteLoading = useCallback(() => {
    clearPendingTimer();
    setIsRouteLoading(true);
    timeoutRef.current = window.setTimeout(() => {
      setIsRouteLoading(false);
      timeoutRef.current = null;
    }, 12000);
  }, [clearPendingTimer]);

  useEffect(() => {
    clearPendingTimer();
    const resetHandle = window.setTimeout(() => {
      setIsRouteLoading(false);
    }, 0);
    return () => {
      window.clearTimeout(resetHandle);
    };
  }, [pathname, searchParams, clearPendingTimer]);

  useEffect(() => {
    return () => {
      clearPendingTimer();
    };
  }, [clearPendingTimer]);

  const value = useMemo(
    () => ({
      isRouteLoading,
      startRouteLoading,
    }),
    [isRouteLoading, startRouteLoading],
  );

  return <RouteLoadingContext.Provider value={value}>{children}</RouteLoadingContext.Provider>;
}

export function useRouteLoading() {
  const context = useContext(RouteLoadingContext);
  if (!context) {
    throw new Error("useRouteLoading must be used inside RouteLoadingProvider");
  }
  return context;
}

export function RouteLoadingBar() {
  const { isRouteLoading } = useRouteLoading();

  return (
    <div
      className={`pointer-events-none fixed inset-x-0 top-0 z-[80] h-1 overflow-hidden transition-opacity duration-200 ${
        isRouteLoading ? "opacity-100" : "opacity-0"
      }`}
      aria-hidden={!isRouteLoading}
    >
      <div className="h-full w-full bg-[linear-gradient(90deg,rgba(239,68,68,0.15),rgba(239,68,68,0.95),rgba(244,63,94,0.2))] animate-[route-loading_1.1s_ease-in-out_infinite]" />
    </div>
  );
}
