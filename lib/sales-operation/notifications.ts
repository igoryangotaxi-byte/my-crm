import {
  SALES_NOTIFICATION_TYPES,
  type SalesNotification,
  type SalesNotificationType,
} from "@/lib/sales-operation/types";
import { getSupabaseAdminClient } from "@/lib/supabase";

function normalizeType(value: unknown): SalesNotificationType {
  const raw = typeof value === "string" ? value.trim() : "";
  return (SALES_NOTIFICATION_TYPES as readonly string[]).includes(raw)
    ? (raw as SalesNotificationType)
    : "system";
}

function mapRow(row: Record<string, unknown>): SalesNotification {
  return {
    id: String(row.id),
    userId: String(row.user_id ?? ""),
    type: normalizeType(row.type),
    title: String(row.title ?? ""),
    body: typeof row.body === "string" && row.body.trim() ? row.body : null,
    leadId: typeof row.lead_id === "string" ? row.lead_id : null,
    link: typeof row.link === "string" && row.link.trim() ? row.link : null,
    isRead: Boolean(row.is_read),
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

export type CreateNotificationInput = {
  userId: string | null;
  type: SalesNotificationType;
  title: string;
  body?: string | null;
  leadId?: string | null;
  link?: string | null;
};

/** Best-effort notification delivery — never throws so it cannot break core flows. */
export async function createNotification(input: CreateNotificationInput): Promise<void> {
  try {
    if (!input.userId || !input.title.trim()) return;
    const supabase = getSupabaseAdminClient();
    const { error } = await supabase.from("sales_notifications").insert({
      user_id: input.userId,
      type: input.type,
      title: input.title.trim(),
      body: input.body?.trim() || null,
      lead_id: input.leadId ?? null,
      link: input.link?.trim() || null,
      is_read: false,
      created_at: new Date().toISOString(),
    });
    if (error) {
      console.error("Failed to create sales notification:", error.message);
    }
  } catch (error) {
    console.error("Failed to create sales notification:", error);
  }
}

export async function listNotifications(
  userId: string,
  options: { unreadOnly?: boolean; limit?: number } = {},
): Promise<SalesNotification[]> {
  const supabase = getSupabaseAdminClient();
  let query = supabase
    .from("sales_notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 30);
  if (options.unreadOnly) query = query.eq("is_read", false);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
}

export async function countUnreadNotifications(userId: string): Promise<number> {
  const supabase = getSupabaseAdminClient();
  const { count, error } = await supabase
    .from("sales_notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_read", false);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function markNotificationsRead(
  userId: string,
  options: { ids?: string[]; all?: boolean },
): Promise<void> {
  const supabase = getSupabaseAdminClient();
  let query = supabase
    .from("sales_notifications")
    .update({ is_read: true })
    .eq("user_id", userId)
    .eq("is_read", false);
  if (!options.all) {
    const ids = (options.ids ?? []).filter((id) => typeof id === "string" && id.trim());
    if (ids.length === 0) return;
    query = query.in("id", ids);
  }
  const { error } = await query;
  if (error) throw new Error(error.message);
}
