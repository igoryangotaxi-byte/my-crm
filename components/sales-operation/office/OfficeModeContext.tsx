"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { OfficeFocusEntity, OfficeRoomId } from "@/lib/sales-operation/office/types";
import {
  loadOfficePerformance,
  saveOfficePerformance,
  type OfficePerformanceSettings,
  type OfficeGraphicsPreset,
  OFFICE_PERF_PRESETS,
} from "@/lib/sales-operation/office/performance";

const MODE_KEY = "appli-crm-office-mode-v1";
const CLASSIC_PATH_KEY = "appli-crm-office-return-path-v1";

type OfficeMode = "classic" | "office";

type OfficeModeContextValue = {
  mode: OfficeMode;
  setMode: (mode: OfficeMode) => void;
  toggleMode: () => void;
  focusEntity: OfficeFocusEntity;
  setFocusEntity: (entity: OfficeFocusEntity) => void;
  activeRoom: OfficeRoomId;
  setActiveRoom: (room: OfficeRoomId) => void;
  returnToClassicPath: string;
  setReturnToClassicPath: (path: string) => void;
  perf: OfficePerformanceSettings;
  setGraphicsPreset: (preset: OfficeGraphicsPreset) => void;
  setShadows: (enabled: boolean) => void;
};

const OfficeModeContext = createContext<OfficeModeContextValue | null>(null);

export function OfficeModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<OfficeMode>("classic");
  const [focusEntity, setFocusEntity] = useState<OfficeFocusEntity>(null);
  const [activeRoom, setActiveRoom] = useState<OfficeRoomId>("reception");
  const [returnToClassicPath, setReturnToClassicPathState] = useState("/sales-operation/pipeline");
  const [perf, setPerf] = useState<OfficePerformanceSettings>(OFFICE_PERF_PRESETS.low);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(MODE_KEY);
      if (stored === "office" || stored === "classic") setModeState(stored);
      const path = window.localStorage.getItem(CLASSIC_PATH_KEY);
      if (path?.startsWith("/sales-operation")) setReturnToClassicPathState(path);
      setPerf(loadOfficePerformance());
    } finally {
      setHydrated(true);
    }
  }, []);

  const setMode = useCallback((next: OfficeMode) => {
    setModeState(next);
    window.localStorage.setItem(MODE_KEY, next);
  }, []);

  const toggleMode = useCallback(() => {
    setModeState((prev) => {
      const next = prev === "office" ? "classic" : "office";
      window.localStorage.setItem(MODE_KEY, next);
      return next;
    });
  }, []);

  const setReturnToClassicPath = useCallback((path: string) => {
    setReturnToClassicPathState(path);
    window.localStorage.setItem(CLASSIC_PATH_KEY, path);
  }, []);

  const setGraphicsPreset = useCallback((preset: OfficeGraphicsPreset) => {
    setPerf((prev) => {
      const next = { ...OFFICE_PERF_PRESETS[preset], shadows: prev.shadows && preset === "high" };
      if (preset === "high") next.shadows = true;
      if (preset === "low" || preset === "static") next.shadows = false;
      saveOfficePerformance(next);
      return next;
    });
  }, []);

  const setShadows = useCallback((enabled: boolean) => {
    setPerf((prev) => {
      const next = { ...prev, shadows: enabled };
      saveOfficePerformance(next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      mode: hydrated ? mode : "classic",
      setMode,
      toggleMode,
      focusEntity,
      setFocusEntity,
      activeRoom,
      setActiveRoom,
      returnToClassicPath,
      setReturnToClassicPath,
      perf,
      setGraphicsPreset,
      setShadows,
    }),
    [
      hydrated,
      mode,
      setMode,
      toggleMode,
      focusEntity,
      activeRoom,
      returnToClassicPath,
      setReturnToClassicPath,
      perf,
      setGraphicsPreset,
      setShadows,
    ],
  );

  return <OfficeModeContext.Provider value={value}>{children}</OfficeModeContext.Provider>;
}

export function useOfficeMode() {
  const ctx = useContext(OfficeModeContext);
  if (!ctx) throw new Error("useOfficeMode must be used within OfficeModeProvider");
  return ctx;
}
