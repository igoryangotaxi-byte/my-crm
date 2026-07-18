import { getSupabaseAdminClient } from "@/lib/supabase";
import { isSalesKpiMetric, type SalesKpiMetric } from "@/lib/sales-operation/manager-kpi";

export type KpiTargetPeriodType = "month" | "quarter";

export type SalesKpiTarget = {
  id: string;
  managerUserId: string;
  metricKey: SalesKpiMetric;
  periodType: KpiTargetPeriodType;
  periodStart: string;
  targetValue: number;
  createdByUserId: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type UpsertKpiTargetInput = {
  managerUserId: string;
  metricKey: string;
  periodType: string;
  periodStart: string;
  targetValue: number;
};

function mapRow(row: Record<string, unknown>): SalesKpiTarget {
  return {
    id: String(row.id),
    managerUserId: String(row.manager_user_id ?? ""),
    metricKey: String(row.metric_key ?? "") as SalesKpiMetric,
    periodType: (String(row.period_type ?? "month") as KpiTargetPeriodType),
    periodStart: String(row.period_start ?? ""),
    targetValue: Number(row.target_value ?? 0),
    createdByUserId: typeof row.created_by_user_id === "string" ? row.created_by_user_id : null,
    createdByName: typeof row.created_by_name === "string" ? row.created_by_name : null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

export function isKpiTargetPeriodType(value: string): value is KpiTargetPeriodType {
  return value === "month" || value === "quarter";
}

/** Normalizes any date within a period to its canonical period_start (YYYY-MM-DD). */
export function normalizePeriodStart(periodType: KpiTargetPeriodType, dateIso: string): string {
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid period start date.");
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth(); // 0-based
  if (periodType === "quarter") {
    const quarterFirstMonth = Math.floor(month / 3) * 3;
    return `${year}-${String(quarterFirstMonth + 1).padStart(2, "0")}-01`;
  }
  return `${year}-${String(month + 1).padStart(2, "0")}-01`;
}

export type ListKpiTargetsFilter = {
  managerUserId?: string | null;
  periodType?: KpiTargetPeriodType | null;
  periodStart?: string | null;
};

export async function listKpiTargets(filter: ListKpiTargetsFilter = {}): Promise<SalesKpiTarget[]> {
  const supabase = getSupabaseAdminClient();
  let query = supabase.from("sales_kpi_targets").select("*");
  if (filter.managerUserId) query = query.eq("manager_user_id", filter.managerUserId);
  if (filter.periodType) query = query.eq("period_type", filter.periodType);
  if (filter.periodStart) query = query.eq("period_start", filter.periodStart);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
}

export async function upsertKpiTarget(
  input: UpsertKpiTargetInput,
  actor: { userId: string | null; name: string },
): Promise<SalesKpiTarget> {
  if (!input.managerUserId?.trim()) throw new Error("managerUserId is required.");
  if (!isSalesKpiMetric(input.metricKey)) throw new Error(`Unknown metric: ${input.metricKey}`);
  if (!isKpiTargetPeriodType(input.periodType)) throw new Error(`Unknown period type: ${input.periodType}`);
  const periodStart = normalizePeriodStart(input.periodType, input.periodStart);
  const targetValue = Number.isFinite(input.targetValue) ? input.targetValue : 0;

  const supabase = getSupabaseAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("sales_kpi_targets")
    .upsert(
      {
        manager_user_id: input.managerUserId.trim(),
        metric_key: input.metricKey,
        period_type: input.periodType,
        period_start: periodStart,
        target_value: targetValue,
        created_by_user_id: actor.userId,
        created_by_name: actor.name,
        updated_at: now,
      },
      { onConflict: "manager_user_id,metric_key,period_type,period_start" },
    )
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to save KPI target.");
  return mapRow(data as Record<string, unknown>);
}

export async function deleteKpiTarget(id: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("sales_kpi_targets").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
