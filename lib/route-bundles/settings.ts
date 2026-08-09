import { getSupabaseAdminClient } from "@/lib/supabase";
import type { RouteBundleSettings } from "@/lib/route-bundles/types";

const SETTINGS_ID = "default";

export const DEFAULT_ROUTE_BUNDLE_SETTINGS: RouteBundleSettings = {
  maxOrdersPerBundle: 4,
  minSafetyBufferMin: 10,
  maxEmptyDriveKm: 40,
  trafficAware: true,
  autoGenerateSuggestions: false,
  allowInsertIntoAccepted: false,
  serviceDurationFallbackMin: 25,
  maxMatrixCellsPerGenerate: 4000,
  maxCandidateOrders: 120,
  updatedAt: new Date(0).toISOString(),
  updatedBy: null,
};

function mapRow(row: Record<string, unknown> | null): RouteBundleSettings {
  if (!row) return { ...DEFAULT_ROUTE_BUNDLE_SETTINGS };
  return {
    maxOrdersPerBundle: Number(row.max_orders_per_bundle ?? 4),
    minSafetyBufferMin: Number(row.min_safety_buffer_min ?? 10),
    maxEmptyDriveKm: Number(row.max_empty_drive_km ?? DEFAULT_ROUTE_BUNDLE_SETTINGS.maxEmptyDriveKm),
    trafficAware: Boolean(row.traffic_aware ?? true),
    autoGenerateSuggestions: Boolean(row.auto_generate_suggestions ?? false),
    allowInsertIntoAccepted: Boolean(row.allow_insert_into_accepted ?? false),
    serviceDurationFallbackMin: Number(
      row.service_duration_fallback_min ?? DEFAULT_ROUTE_BUNDLE_SETTINGS.serviceDurationFallbackMin,
    ),
    maxMatrixCellsPerGenerate: Number(
      row.max_matrix_cells_per_generate ?? DEFAULT_ROUTE_BUNDLE_SETTINGS.maxMatrixCellsPerGenerate,
    ),
    maxCandidateOrders: Number(
      row.max_candidate_orders ?? DEFAULT_ROUTE_BUNDLE_SETTINGS.maxCandidateOrders,
    ),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
    updatedBy: typeof row.updated_by === "string" ? row.updated_by : null,
  };
}

export async function getRouteBundleSettings(): Promise<RouteBundleSettings> {
  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("preorder_route_bundle_settings")
      .select("*")
      .eq("id", SETTINGS_ID)
      .maybeSingle();
    if (error) {
      console.error("getRouteBundleSettings:", error.message);
      return { ...DEFAULT_ROUTE_BUNDLE_SETTINGS, updatedAt: new Date().toISOString() };
    }
    if (!data) {
      await supabase.from("preorder_route_bundle_settings").insert({ id: SETTINGS_ID });
      return { ...DEFAULT_ROUTE_BUNDLE_SETTINGS, updatedAt: new Date().toISOString() };
    }
    return mapRow(data as Record<string, unknown>);
  } catch (error) {
    console.error("getRouteBundleSettings:", error);
    return { ...DEFAULT_ROUTE_BUNDLE_SETTINGS, updatedAt: new Date().toISOString() };
  }
}

export type RouteBundleSettingsUpdate = Partial<{
  maxOrdersPerBundle: number;
  minSafetyBufferMin: number;
  maxEmptyDriveKm: number;
  trafficAware: boolean;
  autoGenerateSuggestions: boolean;
  allowInsertIntoAccepted: boolean;
  serviceDurationFallbackMin: number;
  maxMatrixCellsPerGenerate: number;
  maxCandidateOrders: number;
}>;

export async function updateRouteBundleSettings(
  patch: RouteBundleSettingsUpdate,
  updatedBy: string | null,
): Promise<RouteBundleSettings> {
  const current = await getRouteBundleSettings();
  const next = {
    max_orders_per_bundle: clampInt(patch.maxOrdersPerBundle ?? current.maxOrdersPerBundle, 2, 10),
    min_safety_buffer_min: clampInt(patch.minSafetyBufferMin ?? current.minSafetyBufferMin, 0, 120),
    max_empty_drive_km: Math.max(1, Number(patch.maxEmptyDriveKm ?? current.maxEmptyDriveKm)),
    traffic_aware: patch.trafficAware ?? current.trafficAware,
    auto_generate_suggestions: patch.autoGenerateSuggestions ?? current.autoGenerateSuggestions,
    allow_insert_into_accepted: patch.allowInsertIntoAccepted ?? current.allowInsertIntoAccepted,
    service_duration_fallback_min: clampInt(
      patch.serviceDurationFallbackMin ?? current.serviceDurationFallbackMin,
      5,
      180,
    ),
    max_matrix_cells_per_generate: clampInt(
      patch.maxMatrixCellsPerGenerate ?? current.maxMatrixCellsPerGenerate,
      50,
      20000,
    ),
    max_candidate_orders: clampInt(patch.maxCandidateOrders ?? current.maxCandidateOrders, 10, 200),
    updated_by: updatedBy,
    updated_at: new Date().toISOString(),
  };
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("preorder_route_bundle_settings")
    .upsert({ id: SETTINGS_ID, ...next }, { onConflict: "id" })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapRow(data as Record<string, unknown>);
}

function clampInt(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}
