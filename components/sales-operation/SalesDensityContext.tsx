"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type UiDensity = "comfortable" | "compact";

type DensityContextValue = {
  density: UiDensity;
  setDensity: (value: UiDensity) => void;
  toggle: () => void;
};

const DensityContext = createContext<DensityContextValue | null>(null);
const STORAGE_KEY = "so-ui-density";

export function SalesDensityProvider({ children }: { children: React.ReactNode }) {
  const [density, setDensityState] = useState<UiDensity>("comfortable");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "compact" || stored === "comfortable") setDensityState(stored);
    } catch {
      // ignore
    }
  }, []);

  const setDensity = useCallback((value: UiDensity) => {
    setDensityState(value);
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // ignore
    }
  }, []);

  const toggle = useCallback(() => {
    setDensity(density === "compact" ? "comfortable" : "compact");
  }, [density, setDensity]);

  const value = useMemo(() => ({ density, setDensity, toggle }), [density, setDensity, toggle]);
  return <DensityContext.Provider value={value}>{children}</DensityContext.Provider>;
}

export function useSalesDensity() {
  const ctx = useContext(DensityContext);
  if (!ctx) throw new Error("useSalesDensity must be used within SalesDensityProvider");
  return ctx;
}
