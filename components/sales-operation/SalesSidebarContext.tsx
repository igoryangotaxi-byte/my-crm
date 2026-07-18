"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

type SidebarContextValue = {
  collapsed: boolean;
  hydrated: boolean;
  toggle: () => void;
  setCollapsed: (value: boolean) => void;
  mobileOpen: boolean;
  setMobileOpen: (value: boolean) => void;
};

const SidebarContext = createContext<SidebarContextValue | null>(null);

const STORAGE_KEY = "so-sidebar-collapsed";

export function SalesSidebarProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsedState] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "1") setCollapsedState(true);
    } catch {
      // ignore storage access errors
    }
    setHydrated(true);
  }, []);

  const setCollapsed = useCallback((value: boolean) => {
    setCollapsedState(value);
    try {
      window.localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
    } catch {
      // ignore storage access errors
    }
  }, []);

  const toggle = useCallback(() => setCollapsed(!collapsed), [collapsed, setCollapsed]);

  const value = useMemo(
    () => ({ collapsed, hydrated, toggle, setCollapsed, mobileOpen, setMobileOpen }),
    [collapsed, hydrated, toggle, setCollapsed, mobileOpen],
  );

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

export function useSalesSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error("useSalesSidebar must be used within SalesSidebarProvider");
  return ctx;
}
