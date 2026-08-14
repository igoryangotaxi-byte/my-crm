import { getSupabaseAdminClient, isSupabaseConfigured } from "@/lib/supabase";
import {
  DEFAULT_AI_PREFERENCES,
  type AiPageContext,
  type AiUiBlock,
  type AiUserPreferences,
} from "@/lib/ai/types";

function readText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export type AiConversation = {
  id: string;
  userId: string;
  title: string | null;
  openclawSessionKey: string;
  pageContext: AiPageContext | null;
  createdAt: string;
  updatedAt: string;
};

export type AiMessage = {
  id: string;
  conversationId: string;
  userId: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  uiBlocks: AiUiBlock[];
  toolName: string | null;
  createdAt: string;
};

export async function getAiPreferences(userId: string): Promise<AiUserPreferences> {
  if (!isSupabaseConfigured()) return { userId, ...DEFAULT_AI_PREFERENCES };
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("ai_user_preferences")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return { userId, ...DEFAULT_AI_PREFERENCES };
  return {
    userId,
    timezone: String(data.timezone ?? DEFAULT_AI_PREFERENCES.timezone),
    locale: String(data.locale ?? DEFAULT_AI_PREFERENCES.locale),
    preferredMeetingMinutes: Number(data.preferred_meeting_minutes ?? 30),
    workingHoursStart: String(data.working_hours_start ?? "09:00"),
    workingHoursEnd: String(data.working_hours_end ?? "18:00"),
    avoidStart: String(data.avoid_start ?? "12:00"),
    avoidEnd: String(data.avoid_end ?? "13:00"),
    preferredFocus: String(data.preferred_focus ?? "mornings"),
    meetingProvider: String(data.meeting_provider ?? "google_meet"),
    autoLowRiskWrites: Boolean(data.auto_low_risk_writes ?? true),
    allowDirectSendEmail: Boolean(data.allow_direct_send_email ?? false),
    allowDirectSendTelegram: Boolean(data.allow_direct_send_telegram ?? false),
    voiceShortcut: String(data.voice_shortcut ?? "Alt+Space"),
    extra:
      data.extra && typeof data.extra === "object" && !Array.isArray(data.extra)
        ? (data.extra as Record<string, unknown>)
        : {},
  };
}

export async function upsertAiPreferences(
  userId: string,
  patch: Partial<AiUserPreferences>,
): Promise<AiUserPreferences> {
  const current = await getAiPreferences(userId);
  const next: AiUserPreferences = { ...current, ...patch, userId };
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("ai_user_preferences").upsert(
    {
      user_id: userId,
      timezone: next.timezone,
      locale: next.locale,
      preferred_meeting_minutes: next.preferredMeetingMinutes,
      working_hours_start: next.workingHoursStart,
      working_hours_end: next.workingHoursEnd,
      avoid_start: next.avoidStart,
      avoid_end: next.avoidEnd,
      preferred_focus: next.preferredFocus,
      meeting_provider: next.meetingProvider,
      auto_low_risk_writes: next.autoLowRiskWrites,
      allow_direct_send_email: next.allowDirectSendEmail,
      allow_direct_send_telegram: next.allowDirectSendTelegram,
      voice_shortcut: next.voiceShortcut,
      extra: next.extra,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(error.message);
  return next;
}

export async function listConversations(userId: string, limit = 20): Promise<AiConversation[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("ai_conversations")
    .select("*")
    .eq("user_id", userId)
    .is("archived_at", null)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapConversation);
}

export async function getConversation(id: string, userId: string): Promise<AiConversation | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("ai_conversations")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapConversation(data as Record<string, unknown>) : null;
}

export async function createConversation(input: {
  userId: string;
  sessionKey: string;
  title?: string | null;
  pageContext?: AiPageContext | null;
}): Promise<AiConversation> {
  const supabase = getSupabaseAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("ai_conversations")
    .insert({
      user_id: input.userId,
      title: input.title ?? null,
      openclaw_session_key: input.sessionKey,
      page_context: input.pageContext ?? null,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapConversation(data as Record<string, unknown>);
}

export async function touchConversation(id: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  await supabase.from("ai_conversations").update({ updated_at: new Date().toISOString() }).eq("id", id);
}

export async function listMessages(conversationId: string, userId: string): Promise<AiMessage[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("ai_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapMessage);
}

export async function appendMessage(input: {
  conversationId: string;
  userId: string;
  role: AiMessage["role"];
  content: string;
  uiBlocks?: AiUiBlock[];
  toolName?: string | null;
}): Promise<AiMessage> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("ai_messages")
    .insert({
      conversation_id: input.conversationId,
      user_id: input.userId,
      role: input.role,
      content: input.content,
      ui_blocks: input.uiBlocks ?? [],
      tool_name: input.toolName ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  await touchConversation(input.conversationId);
  return mapMessage(data as Record<string, unknown>);
}

export async function writeAiAction(input: {
  userId: string;
  conversationId?: string | null;
  agentSessionId?: string | null;
  tool: string;
  action: string;
  paramsRedacted: Record<string, unknown>;
  resultStatus: string;
  approvalState: string;
  latencyMs?: number | null;
  error?: string | null;
}): Promise<void> {
  try {
    const supabase = getSupabaseAdminClient();
    await supabase.from("ai_actions").insert({
      user_id: input.userId,
      conversation_id: input.conversationId ?? null,
      agent_session_id: input.agentSessionId ?? null,
      tool: input.tool,
      action: input.action,
      params_redacted: input.paramsRedacted,
      result_status: input.resultStatus,
      approval_state: input.approvalState,
      latency_ms: input.latencyMs ?? null,
      error: input.error ?? null,
    });
  } catch (error) {
    console.error("Failed to write ai_actions:", error);
  }
}

export async function getIdempotentResult(
  userId: string,
  key: string,
): Promise<unknown | null> {
  const supabase = getSupabaseAdminClient();
  const { data } = await supabase
    .from("ai_action_idempotency")
    .select("result")
    .eq("user_id", userId)
    .eq("idempotency_key", key)
    .maybeSingle();
  return data?.result ?? null;
}

export async function saveIdempotentResult(
  userId: string,
  key: string,
  tool: string,
  result: unknown,
): Promise<void> {
  const supabase = getSupabaseAdminClient();
  await supabase.from("ai_action_idempotency").upsert(
    {
      user_id: userId,
      idempotency_key: key,
      tool,
      result,
      created_at: new Date().toISOString(),
    },
    { onConflict: "user_id,idempotency_key" },
  );
}

export async function createConfirmation(input: {
  userId: string;
  tool: string;
  args: Record<string, unknown>;
  preview: Record<string, unknown>;
}): Promise<string> {
  const token = crypto.randomUUID();
  const supabase = getSupabaseAdminClient();
  const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const { error } = await supabase.from("ai_confirmations").insert({
    token,
    user_id: input.userId,
    tool: input.tool,
    args: input.args,
    preview: input.preview,
    expires_at: expires,
  });
  if (error) throw new Error(error.message);
  return token;
}

export async function consumeConfirmation(token: string, userId: string) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("ai_confirmations")
    .select("*")
    .eq("token", token)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  if (data.consumed_at) return null;
  if (new Date(String(data.expires_at)).getTime() < Date.now()) return null;
  await supabase
    .from("ai_confirmations")
    .update({ consumed_at: new Date().toISOString() })
    .eq("token", token);
  return {
    tool: String(data.tool),
    args: (data.args ?? {}) as Record<string, unknown>,
    preview: (data.preview ?? {}) as Record<string, unknown>,
  };
}

export async function getTelegramLink(userId: string) {
  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabaseAdminClient();
  const { data } = await supabase.from("ai_telegram_links").select("*").eq("user_id", userId).maybeSingle();
  return data as Record<string, unknown> | null;
}

export async function getTelegramLinkByChatId(chatId: string) {
  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabaseAdminClient();
  const { data } = await supabase
    .from("ai_telegram_links")
    .select("*")
    .eq("telegram_chat_id", chatId)
    .maybeSingle();
  return data as Record<string, unknown> | null;
}

export async function upsertTelegramLink(input: {
  userId: string;
  chatId: string;
  username?: string | null;
}): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("ai_telegram_links").upsert(
    {
      user_id: input.userId,
      telegram_chat_id: input.chatId,
      telegram_username: input.username ?? null,
      linked_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(error.message);
}

export async function setTelegramLinkCode(userId: string, code: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("ai_telegram_links").upsert(
    {
      user_id: userId,
      telegram_chat_id: `pending:${userId}`,
      link_code: code,
      linked_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(error.message);
}

export async function deleteTelegramLink(userId: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("ai_telegram_links").delete().eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function findTelegramLinkByCode(code: string) {
  const supabase = getSupabaseAdminClient();
  const { data } = await supabase.from("ai_telegram_links").select("*").eq("link_code", code).maybeSingle();
  return data as Record<string, unknown> | null;
}

export async function createReminder(input: {
  userId: string;
  body: string;
  dueAt: string;
  channels?: string[];
}): Promise<string> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("ai_reminders")
    .insert({
      user_id: input.userId,
      body: input.body,
      due_at: input.dueAt,
      channels: input.channels ?? ["in_app"],
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return String(data.id);
}

export async function listDueReminders(nowIso: string) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("ai_reminders")
    .select("*")
    .is("delivered_at", null)
    .lte("due_at", nowIso)
    .limit(100);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function markReminderDelivered(id: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  await supabase.from("ai_reminders").update({ delivered_at: new Date().toISOString() }).eq("id", id);
}

export async function listEnabledNotificationRules() {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("ai_notification_rules")
    .select("*")
    .eq("enabled", true)
    .limit(500);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function upsertNotificationRule(input: {
  userId: string;
  kind: string;
  cronExpr?: string | null;
  fireAt?: string | null;
  channels?: string[];
  payload?: Record<string, unknown>;
  enabled?: boolean;
  id?: string;
}) {
  const supabase = getSupabaseAdminClient();
  const row = {
    user_id: input.userId,
    kind: input.kind,
    cron_expr: input.cronExpr ?? null,
    fire_at: input.fireAt ?? null,
    channels: input.channels ?? ["in_app"],
    enabled: input.enabled ?? true,
    payload: input.payload ?? {},
  };
  if (input.id) {
    const { error } = await supabase.from("ai_notification_rules").update(row).eq("id", input.id);
    if (error) throw new Error(error.message);
    return input.id;
  }
  const { data, error } = await supabase.from("ai_notification_rules").insert(row).select("id").single();
  if (error) throw new Error(error.message);
  return String(data.id);
}

export async function listUserNotificationRules(userId: string) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("ai_notification_rules")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function bumpUsage(input: {
  userId: string;
  requests?: number;
  inputTokens?: number;
  outputTokens?: number;
  sttSeconds?: number;
  ttsSeconds?: number;
  estimatedCostUsd?: number;
}): Promise<void> {
  try {
    const supabase = getSupabaseAdminClient();
    const day = new Date().toISOString().slice(0, 10);
    const { data } = await supabase
      .from("ai_usage_daily")
      .select("*")
      .eq("user_id", input.userId)
      .eq("day", day)
      .maybeSingle();
    const next = {
      user_id: input.userId,
      day,
      requests: Number(data?.requests ?? 0) + (input.requests ?? 0),
      input_tokens: Number(data?.input_tokens ?? 0) + (input.inputTokens ?? 0),
      output_tokens: Number(data?.output_tokens ?? 0) + (input.outputTokens ?? 0),
      stt_seconds: Number(data?.stt_seconds ?? 0) + (input.sttSeconds ?? 0),
      tts_seconds: Number(data?.tts_seconds ?? 0) + (input.ttsSeconds ?? 0),
      estimated_cost_usd: Number(data?.estimated_cost_usd ?? 0) + (input.estimatedCostUsd ?? 0),
    };
    await supabase.from("ai_usage_daily").upsert(next, { onConflict: "user_id,day" });
  } catch (error) {
    console.error("Failed to bump AI usage:", error);
  }
}

export async function getWorkspaceUsageThisMonth(): Promise<number> {
  if (!isSupabaseConfigured()) return 0;
  const supabase = getSupabaseAdminClient();
  const start = new Date();
  start.setUTCDate(1);
  const { data } = await supabase
    .from("ai_usage_daily")
    .select("estimated_cost_usd")
    .gte("day", start.toISOString().slice(0, 10));
  return (data ?? []).reduce((sum, row) => sum + Number(row.estimated_cost_usd ?? 0), 0);
}

function mapConversation(row: Record<string, unknown>): AiConversation {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    title: readText(row.title),
    openclawSessionKey: String(row.openclaw_session_key ?? ""),
    pageContext:
      row.page_context && typeof row.page_context === "object"
        ? (row.page_context as AiPageContext)
        : null,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

function mapMessage(row: Record<string, unknown>): AiMessage {
  const role = String(row.role ?? "assistant");
  return {
    id: String(row.id),
    conversationId: String(row.conversation_id),
    userId: String(row.user_id),
    role:
      role === "user" || role === "system" || role === "tool" || role === "assistant"
        ? role
        : "assistant",
    content: String(row.content ?? ""),
    uiBlocks: Array.isArray(row.ui_blocks) ? (row.ui_blocks as AiUiBlock[]) : [],
    toolName: readText(row.tool_name),
    createdAt: String(row.created_at ?? ""),
  };
}
