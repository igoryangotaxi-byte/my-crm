import { getSupabaseAdminClient } from "@/lib/supabase";

export type SupportSessionStep = "idle" | "awaiting_description";

export type SupportSession = {
  chatId: string;
  step: SupportSessionStep;
  title: string | null;
  telegramUserId: string | null;
  telegramUsername: string | null;
  telegramName: string | null;
  updatedAt: string;
};

function mapRow(row: Record<string, unknown>): SupportSession {
  const stepRaw = String(row.step ?? "idle");
  const step: SupportSessionStep =
    stepRaw === "awaiting_description" ? "awaiting_description" : "idle";
  return {
    chatId: String(row.chat_id),
    step,
    title: typeof row.title === "string" && row.title.trim() ? row.title.trim() : null,
    telegramUserId:
      typeof row.telegram_user_id === "string" && row.telegram_user_id.trim()
        ? row.telegram_user_id.trim()
        : null,
    telegramUsername:
      typeof row.telegram_username === "string" && row.telegram_username.trim()
        ? row.telegram_username.trim()
        : null,
    telegramName:
      typeof row.telegram_name === "string" && row.telegram_name.trim()
        ? row.telegram_name.trim()
        : null,
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

export async function getSupportSession(chatId: string): Promise<SupportSession | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("telegram_support_sessions")
    .select("*")
    .eq("chat_id", chatId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return mapRow(data as Record<string, unknown>);
}

export async function upsertSupportSession(input: {
  chatId: string;
  step: SupportSessionStep;
  title?: string | null;
  telegramUserId?: string | null;
  telegramUsername?: string | null;
  telegramName?: string | null;
}): Promise<SupportSession> {
  const supabase = getSupabaseAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("telegram_support_sessions")
    .upsert(
      {
        chat_id: input.chatId,
        step: input.step,
        title: input.title ?? null,
        telegram_user_id: input.telegramUserId ?? null,
        telegram_username: input.telegramUsername ?? null,
        telegram_name: input.telegramName ?? null,
        updated_at: now,
      },
      { onConflict: "chat_id" },
    )
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapRow(data as Record<string, unknown>);
}

export async function clearSupportSession(chatId: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from("telegram_support_sessions")
    .upsert(
      {
        chat_id: chatId,
        step: "idle",
        title: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "chat_id" },
    );
  if (error) throw new Error(error.message);
}
