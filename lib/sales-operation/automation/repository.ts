import {
  emptyAutomationGraph,
  type AutomationGraph,
  type AutomationRunStatus,
  type AutomationRunStep,
  type SalesAutomation,
  type SalesAutomationListItem,
} from "@/lib/sales-operation/automation/types";
import { getSupabaseAdminClient } from "@/lib/supabase";
import type { Edge, Node, Viewport } from "@xyflow/react";

function readGraph(value: unknown): AutomationGraph {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return emptyAutomationGraph();
  }
  const raw = value as Record<string, unknown>;
  const nodes = Array.isArray(raw.nodes) ? (raw.nodes as Node[]) : [];
  const edges = Array.isArray(raw.edges) ? (raw.edges as Edge[]) : [];
  const viewport =
    raw.viewport && typeof raw.viewport === "object" && !Array.isArray(raw.viewport)
      ? (raw.viewport as Viewport)
      : { x: 0, y: 0, zoom: 1 };
  return { nodes, edges, viewport };
}

function readRoundRobinState(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, number> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === "number" && Number.isFinite(entry)) out[key] = entry;
  }
  return out;
}

function mapAutomationRow(row: Record<string, unknown>): SalesAutomation {
  return {
    id: String(row.id),
    name: String(row.name ?? "Untitled"),
    enabled: Boolean(row.enabled),
    graph: readGraph(row.graph),
    roundRobinState: readRoundRobinState(row.round_robin_state),
    createdByUserId: typeof row.created_by_user_id === "string" ? row.created_by_user_id : null,
    createdByName: typeof row.created_by_name === "string" ? row.created_by_name : null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

function mapListItem(row: Record<string, unknown>): SalesAutomationListItem {
  return {
    id: String(row.id),
    name: String(row.name ?? "Untitled"),
    enabled: Boolean(row.enabled),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

export async function listSalesAutomations(): Promise<SalesAutomationListItem[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("sales_automations")
    .select("id,name,enabled,created_at,updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapListItem(row as Record<string, unknown>));
}

export async function listEnabledSalesAutomations(): Promise<SalesAutomation[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("sales_automations")
    .select("*")
    .eq("enabled", true)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapAutomationRow(row as Record<string, unknown>));
}

export async function getSalesAutomationById(id: string): Promise<SalesAutomation | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.from("sales_automations").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return mapAutomationRow(data as Record<string, unknown>);
}

export async function createSalesAutomation(
  input: { name?: string },
  actor: { userId: string | null; name: string },
): Promise<SalesAutomation> {
  const supabase = getSupabaseAdminClient();
  const now = new Date().toISOString();
  const name = input.name?.trim() || "New workflow";
  const { data, error } = await supabase
    .from("sales_automations")
    .insert({
      name,
      enabled: false,
      graph: emptyAutomationGraph(),
      round_robin_state: {},
      created_by_user_id: actor.userId,
      created_by_name: actor.name,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to create automation.");
  return mapAutomationRow(data as Record<string, unknown>);
}

export async function updateSalesAutomation(
  id: string,
  input: {
    name?: string;
    enabled?: boolean;
    graph?: AutomationGraph;
  },
): Promise<SalesAutomation> {
  const supabase = getSupabaseAdminClient();
  const existing = await getSalesAutomationById(id);
  if (!existing) throw new Error("Automation not found.");

  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (input.name !== undefined) payload.name = input.name.trim() || existing.name;
  if (input.enabled !== undefined) payload.enabled = input.enabled;
  if (input.graph !== undefined) {
    payload.graph = {
      nodes: input.graph.nodes ?? [],
      edges: input.graph.edges ?? [],
      viewport: input.graph.viewport ?? { x: 0, y: 0, zoom: 1 },
    };
  }

  const { data, error } = await supabase
    .from("sales_automations")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to update automation.");
  return mapAutomationRow(data as Record<string, unknown>);
}

export async function deleteSalesAutomation(id: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("sales_automations").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function updateAutomationRoundRobinState(
  id: string,
  roundRobinState: Record<string, number>,
): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from("sales_automations")
    .update({
      round_robin_state: roundRobinState,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function setLeadAssignedManager(
  leadId: string,
  manager: { userId: string; name: string },
): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from("sales_leads")
    .update({
      assigned_manager_user_id: manager.userId,
      assigned_manager_name: manager.name,
      updated_at: new Date().toISOString(),
    })
    .eq("id", leadId);
  if (error) throw new Error(error.message);
}

export async function insertAutomationRun(input: {
  automationId: string;
  leadId: string;
  fromStatus: string;
  toStatus: string;
  status: AutomationRunStatus;
  steps: AutomationRunStep[];
}): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("sales_automation_runs").insert({
    automation_id: input.automationId,
    lead_id: input.leadId,
    trigger_from_status: input.fromStatus,
    trigger_to_status: input.toStatus,
    status: input.status,
    steps: input.steps,
    created_at: new Date().toISOString(),
  });
  if (error) {
    console.error("Failed to insert sales_automation_run:", error.message);
  }
}
