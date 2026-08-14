import { loadAuthStore } from "@/lib/auth-store";
import { isEmailSendingConfigured } from "@/lib/sales-operation/email-gateway";
import { getCalendarTokens, isGoogleCalendarConfigured } from "@/lib/google/calendar";
import { getGmailTokens } from "@/lib/ai/gmail";
import { getTelegramLink } from "@/lib/ai/repository";
import { getAiPreferences } from "@/lib/ai/repository";
import { AI_WORKSPACE_ID, type AiPageContext, type AiTrustedContext } from "@/lib/ai/types";
import type { AuthUser } from "@/types/auth";

export async function buildTrustedAiContext(
  user: AuthUser,
  pageContext?: AiPageContext | null,
): Promise<AiTrustedContext> {
  const store = await loadAuthStore();
  const permissions = store.rolePermissions[user.role];
  const prefs = await getAiPreferences(user.id).catch(() => null);
  const [calendar, gmail, telegram] = await Promise.all([
    isGoogleCalendarConfigured()
      ? getCalendarTokens(user.id).then((row) => Boolean(row)).catch(() => false)
      : Promise.resolve(false),
    getGmailTokens(user.id).then((row) => Boolean(row)).catch(() => false),
    getTelegramLink(user.id).then((row) => Boolean(row)).catch(() => false),
  ]);

  return {
    userId: user.id,
    userName: user.name,
    userEmail: user.email,
    workspaceId: AI_WORKSPACE_ID,
    role: user.role,
    permissions,
    timezone: prefs?.timezone ?? "Asia/Jerusalem",
    locale: prefs?.locale ?? user.language ?? "en",
    integrations: {
      googleCalendar: calendar,
      gmail,
      telegram,
      smtp: isEmailSendingConfigured(),
    },
    pageContext: pageContext ?? null,
  };
}

export function sessionKeyForUser(userId: string, threadId?: string | null): string {
  if (threadId?.trim()) return `appli:user:${userId}:thread:${threadId.trim()}`;
  return `appli:user:${userId}`;
}
