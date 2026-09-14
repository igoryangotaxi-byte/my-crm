"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";
import {
  DEFAULT_UI_DENSITY,
  SO_DENSITY_STORAGE_KEY,
  resolveUiDensity,
  type UiDensity,
} from "@/lib/sales-operation/ui-density";

export type { UiDensity };

type DensityContextValue = {
  density: UiDensity;
  setDensity: (value: UiDensity) => void;
  toggle: () => void;
};

const DensityContext = createContext<DensityContextValue | null>(null);

const listeners = new Set<() => void>();

function emitDensityChange() {
  listeners.forEach((listener) => listener());
}

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

function readStoredDensity(): UiDensity {
  try {
    return resolveUiDensity(window.localStorage.getItem(SO_DENSITY_STORAGE_KEY));
  } catch {
    return DEFAULT_UI_DENSITY;
  }
}

function getServerSnapshot(): UiDensity {
  return DEFAULT_UI_DENSITY;
}

export function SalesDensityProvider({ children }: { children: React.ReactNode }) {
  const density = useSyncExternalStore(subscribe, readStoredDensity, getServerSnapshot);

  const setDensity = useCallback((value: UiDensity) => {
    try {
      window.localStorage.setItem(SO_DENSITY_STORAGE_KEY, value);
    } catch {
      // ignore
    }
    emitDensityChange();
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
