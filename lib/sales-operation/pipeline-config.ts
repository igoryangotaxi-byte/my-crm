import { defaultPipelineStages } from "@/lib/sales-operation/display";
import type { PipelineStage, SalesSegment } from "@/lib/sales-operation/types";
import { getSupabaseAdminClient } from "@/lib/supabase";

/** Default segments seeded from the owner feedback; used as a read fallback. */
export const DEFAULT_SEGMENTS = [
  "Transportation",
  "Logistics",
  "Hospitality",
  "Healthcare",
  "Retail",
  "Construction",
  "Technology",
  "Finance",
  "Government",
  "Education",
  "Other",
] as const;

function isMissingTableError(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  const message = (error.message ?? "").toLowerCase();
  return (
    error.code === "42P01" ||
    message.includes("does not exist") ||
    message.includes("could not find the table") ||
    message.includes("schema cache")
  );
}

function mapStageRow(row: Record<string, unknown>): PipelineStage {
  return {
    key: String(row.key ?? ""),
    label: String(row.label ?? row.key ?? ""),
    orderIndex: typeof row.order_index === "number" ? row.order_index : Number(row.order_index ?? 0),
    probability:
      typeof row.probability === "number" ? row.probability : Number(row.probability ?? 0),
    isWon: row.is_won === true,
    isLost: row.is_lost === true,
    isTerminal: row.is_terminal === true,
    isActive: row.is_active !== false,
    color: typeof row.color === "string" && row.color.trim() ? row.color : null,
  };
}

function mapSegmentRow(row: Record<string, unknown>): SalesSegment {
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    orderIndex: typeof row.order_index === "number" ? row.order_index : Number(row.order_index ?? 0),
    isActive: row.is_active !== false,
  };
}

export async function listPipelineStages(): Promise<PipelineStage[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("sales_pipeline_stages")
    .select("*")
    .order("order_index", { ascending: true });
  if (error) {
    if (isMissingTableError(error)) return defaultPipelineStages();
    throw new Error(error.message);
  }
  const rows = (data ?? []).map((row) => mapStageRow(row as Record<string, unknown>));
  return rows.length > 0 ? rows : defaultPipelineStages();
}

export async function upsertPipelineStage(stage: PipelineStage): Promise<PipelineStage> {
  const supabase = getSupabaseAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("sales_pipeline_stages")
    .upsert(
      {
        key: stage.key,
        label: stage.label,
        order_index: stage.orderIndex,
        probability: stage.probability,
        is_won: stage.isWon,
        is_lost: stage.isLost,
        is_terminal: stage.isTerminal,
        is_active: stage.isActive,
        color: stage.color,
        updated_at: now,
      },
      { onConflict: "key" },
    )
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to save pipeline stage.");
  return mapStageRow(data as Record<string, unknown>);
}

export async function reorderPipelineStages(orderedKeys: string[]): Promise<void> {
  const supabase = getSupabaseAdminClient();
  await Promise.all(
    orderedKeys.map((key, index) =>
      supabase.from("sales_pipeline_stages").update({ order_index: index }).eq("key", key),
    ),
  );
}

export async function listSegments(activeOnly = false): Promise<SalesSegment[]> {
  const supabase = getSupabaseAdminClient();
  let query = supabase.from("sales_segments").select("*").order("order_index", { ascending: true });
  if (activeOnly) query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error) {
    if (isMissingTableError(error)) {
      return DEFAULT_SEGMENTS.map((name, index) => ({
        id: name.toLowerCase(),
        name,
        orderIndex: index,
        isActive: true,
      }));
    }
    throw new Error(error.message);
  }
  return (data ?? []).map((row) => mapSegmentRow(row as Record<string, unknown>));
}

export async function createSegment(name: string): Promise<SalesSegment> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Segment name is required.");
  const supabase = getSupabaseAdminClient();
  const { data: maxRow } = await supabase
    .from("sales_segments")
    .select("order_index")
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder =
    maxRow && typeof (maxRow as Record<string, unknown>).order_index === "number"
      ? ((maxRow as Record<string, unknown>).order_index as number) + 1
      : 0;
  const { data, error } = await supabase
    .from("sales_segments")
    .insert({ name: trimmed, order_index: nextOrder, is_active: true })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to create segment.");
  return mapSegmentRow(data as Record<string, unknown>);
}

export async function updateSegment(
  id: string,
  input: { name?: string; isActive?: boolean; orderIndex?: number },
): Promise<SalesSegment> {
  const supabase = getSupabaseAdminClient();
  const payload: Record<string, unknown> = {};
  if (input.name !== undefined) payload.name = input.name.trim();
  if (input.isActive !== undefined) payload.is_active = input.isActive;
  if (input.orderIndex !== undefined) payload.order_index = input.orderIndex;
  const { data, error } = await supabase
    .from("sales_segments")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to update segment.");
  return mapSegmentRow(data as Record<string, unknown>);
}
