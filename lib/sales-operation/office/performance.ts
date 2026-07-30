/**
 * CRM Office performance presets (MVP skeleton).
 * Inspired by Claw3D graphics toggles — Low targets weak laptops.
 */

export type OfficeGraphicsPreset = "low" | "high" | "static";

export type OfficePerformanceSettings = {
  preset: OfficeGraphicsPreset;
  shadows: boolean;
  fpsLimit: number;
  animateAgents: boolean;
  environmentIntensity: number;
  dprMax: number;
};

const STORAGE_KEY = "appli-crm-office-perf-v1";

export const OFFICE_PERF_PRESETS: Record<OfficeGraphicsPreset, OfficePerformanceSettings> = {
  low: {
    preset: "low",
    shadows: false,
    fpsLimit: 30,
    animateAgents: true,
    environmentIntensity: 0.35,
    dprMax: 1,
  },
  high: {
    preset: "high",
    shadows: true,
    fpsLimit: 60,
    animateAgents: true,
    environmentIntensity: 0.65,
    dprMax: 1.75,
  },
  static: {
    preset: "static",
    shadows: false,
    fpsLimit: 24,
    animateAgents: false,
    environmentIntensity: 0.4,
    dprMax: 1,
  },
};

export function loadOfficePerformance(): OfficePerformanceSettings {
  if (typeof window === "undefined") return OFFICE_PERF_PRESETS.low;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return OFFICE_PERF_PRESETS.low;
    const parsed = JSON.parse(raw) as Partial<OfficePerformanceSettings> & {
      preset?: OfficeGraphicsPreset;
    };
    const base =
      parsed.preset && OFFICE_PERF_PRESETS[parsed.preset]
        ? OFFICE_PERF_PRESETS[parsed.preset]
        : OFFICE_PERF_PRESETS.low;
    return {
      ...base,
      shadows: typeof parsed.shadows === "boolean" ? parsed.shadows : base.shadows,
      fpsLimit: typeof parsed.fpsLimit === "number" ? parsed.fpsLimit : base.fpsLimit,
    };
  } catch {
    return OFFICE_PERF_PRESETS.low;
  }
}

export function saveOfficePerformance(settings: OfficePerformanceSettings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
