export type UiDensity = "comfortable" | "compact";

export const SO_DENSITY_STORAGE_KEY = "so-ui-density";

/** Ops shell default when the user has no saved preference. */
export const DEFAULT_UI_DENSITY: UiDensity = "compact";

export function resolveUiDensity(stored: string | null | undefined): UiDensity {
  if (stored === "compact" || stored === "comfortable") return stored;
  return DEFAULT_UI_DENSITY;
}
