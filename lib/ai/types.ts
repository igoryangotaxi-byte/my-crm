import type { AppPageKey, AppRole } from "@/types/auth";

export const AI_WORKSPACE_ID = "appli";

export type AiRiskLevel = 0 | 1 | 2 | 3;

export type AiPageContext = {
  page?: string;
  entityType?: string | null;
  entityId?: string | null;
  selectedItems?: string[];
  activeFilters?: Record<string, string | number | boolean | null>;
};

export type AiTrustedContext = {
  userId: string;
  userName: string;
  userEmail: string;
  workspaceId: typeof AI_WORKSPACE_ID;
  role: AppRole;
  permissions: Record<AppPageKey, boolean>;
  timezone: string;
  locale: string;
  integrations: {
    googleCalendar: boolean;
    gmail: boolean;
    telegram: boolean;
    smtp: boolean;
  };
  pageContext?: AiPageContext | null;
};

export type AiUiBlock =
  | {
      type: "status";
      text: string;
    }
  | {
      type: "meeting_slots";
      slots: Array<{ start: string; end: string; reason: string }>;
    }
  | {
      type: "meeting_preview";
      title: string;
      start: string;
      end: string;
      attendees?: string[];
    }
  | {
      type: "task_preview";
      title: string;
      assignee?: string | null;
      dueAt?: string | null;
    }
  | {
      type: "metric";
      title: string;
      fact: string;
      inference?: string;
      recommendation?: string;
    }
  | {
      type: "confirmation";
      token: string;
      title: string;
      body: string;
      tool: string;
    }
  | {
      type: "connect";
      integration: "googleCalendar" | "gmail" | "telegram";
      text: string;
    };

export type AiToolResult = {
  ok: boolean;
  status?: "needs_confirmation" | "denied" | "ok" | "partial";
  error?: string;
  data?: unknown;
  preview?: Record<string, unknown>;
  confirmToken?: string;
  uiBlocks?: AiUiBlock[];
  userMessage?: string;
};

export type AiSseEvent =
  | { type: "status"; text: string }
  | { type: "delta"; text: string }
  | { type: "card"; card: AiUiBlock }
  | { type: "confirmation"; card: Extract<AiUiBlock, { type: "confirmation" }> }
  | { type: "done"; conversationId: string; messageId: string }
  | { type: "error"; error: string };

export type AiUserPreferences = {
  userId: string;
  timezone: string;
  locale: string;
  preferredMeetingMinutes: number;
  workingHoursStart: string;
  workingHoursEnd: string;
  avoidStart: string;
  avoidEnd: string;
  preferredFocus: string;
  meetingProvider: string;
  autoLowRiskWrites: boolean;
  allowDirectSendEmail: boolean;
  allowDirectSendTelegram: boolean;
  voiceShortcut: string;
  extra: Record<string, unknown>;
};

export const DEFAULT_AI_PREFERENCES: Omit<AiUserPreferences, "userId"> = {
  timezone: "Asia/Jerusalem",
  locale: "en",
  preferredMeetingMinutes: 30,
  workingHoursStart: "09:00",
  workingHoursEnd: "18:00",
  avoidStart: "12:00",
  avoidEnd: "13:00",
  preferredFocus: "mornings",
  meetingProvider: "google_meet",
  autoLowRiskWrites: true,
  allowDirectSendEmail: false,
  allowDirectSendTelegram: false,
  voiceShortcut: "Alt+Space",
  extra: {},
};
