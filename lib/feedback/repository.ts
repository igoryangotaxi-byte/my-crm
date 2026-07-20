import { getSupabaseAdminClient } from "@/lib/supabase";
import {
  feedbackStatusLabel,
  isFeedbackStatus,
  type FeedbackRequest,
  type FeedbackStatus,
} from "@/lib/feedback/types";

function mapRow(row: Record<string, unknown>): FeedbackRequest {
  const statusRaw = typeof row.status === "string" ? row.status : "todo";
  return {
    id: String(row.id),
    title: String(row.title ?? ""),
    description: String(row.description ?? ""),
    status: isFeedbackStatus(statusRaw) ? statusRaw : "todo",
    createdByUserId: String(row.created_by_user_id ?? ""),
    createdByName: String(row.created_by_name ?? ""),
    createdByEmail: typeof row.created_by_email === "string" ? row.created_by_email : null,
    createdByRole: typeof row.created_by_role === "string" ? row.created_by_role : null,
    pathname: typeof row.pathname === "string" ? row.pathname : null,
    telegramChatId: typeof row.telegram_chat_id === "string" ? row.telegram_chat_id : null,
    telegramMessageId:
      typeof row.telegram_message_id === "number"
        ? row.telegram_message_id
        : typeof row.telegram_message_id === "string" && row.telegram_message_id.trim()
          ? Number(row.telegram_message_id)
          : null,
    statusChangedAt: typeof row.status_changed_at === "string" ? row.status_changed_at : null,
    statusNotifiedAt: typeof row.status_notified_at === "string" ? row.status_notified_at : null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

export type CreateFeedbackInput = {
  title: string;
  description: string;
  pathname?: string | null;
  createdByUserId: string;
  createdByName: string;
  createdByEmail?: string | null;
  createdByRole?: string | null;
};

export async function createFeedbackRequest(input: CreateFeedbackInput): Promise<FeedbackRequest> {
  const supabase = getSupabaseAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("feedback_requests")
    .insert({
      title: input.title.trim(),
      description: input.description.trim(),
      status: "todo",
      created_by_user_id: input.createdByUserId,
      created_by_name: input.createdByName,
      created_by_email: input.createdByEmail?.trim() || null,
      created_by_role: input.createdByRole?.trim() || null,
      pathname: input.pathname?.trim() || null,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to create feedback.");
  return mapRow(data as Record<string, unknown>);
}

export async function getFeedbackRequestById(id: string): Promise<FeedbackRequest | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.from("feedback_requests").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return mapRow(data as Record<string, unknown>);
}

export async function updateFeedbackTelegramMeta(
  id: string,
  meta: { telegramChatId: string; telegramMessageId: number },
): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from("feedback_requests")
    .update({
      telegram_chat_id: meta.telegramChatId,
      telegram_message_id: meta.telegramMessageId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function updateFeedbackStatus(
  id: string,
  status: FeedbackStatus,
): Promise<FeedbackRequest> {
  const supabase = getSupabaseAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("feedback_requests")
    .update({
      status,
      status_changed_at: now,
      updated_at: now,
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to update feedback status.");
  return mapRow(data as Record<string, unknown>);
}

export async function markFeedbackStatusNotified(id: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from("feedback_requests")
    .update({
      status_notified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function listMyFeedbackRequests(userId: string): Promise<FeedbackRequest[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("feedback_requests")
    .select("*")
    .eq("created_by_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
}

export async function countUnseenFeedbackStatusUpdates(userId: string): Promise<number> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("feedback_requests")
    .select("id, status_changed_at, status_notified_at")
    .eq("created_by_user_id", userId)
    .not("status_changed_at", "is", null)
    .limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []).filter((row) => {
    const changed = typeof row.status_changed_at === "string" ? row.status_changed_at : null;
    if (!changed) return false;
    const notified = typeof row.status_notified_at === "string" ? row.status_notified_at : null;
    return !notified || notified < changed;
  }).length;
}

export { feedbackStatusLabel };
