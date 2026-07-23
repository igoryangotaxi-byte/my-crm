import { findUserByEmail } from "@/lib/auth-store";
import { logActivity } from "@/lib/sales-operation/activity";
import { createMeeting } from "@/lib/sales-operation/meetings";
import { createNotification } from "@/lib/sales-operation/notifications";
import { createSalesTask } from "@/lib/sales-operation/tasks";
import {
  addChecklistItem,
  createTrackerTicket,
  listTrackerStatuses,
} from "@/lib/sales-operation/tracker";
import type { SalesLead } from "@/lib/sales-operation/types";
import { getSupabaseAdminClient } from "@/lib/supabase";

export const DEFAULT_SIGNED_AM_EMAIL = "igorrebkovets@appli.taxi";

export const ONBOARDING_FIRST_TOUCH_TITLE = "Onboarding + First Touch";

export const SIGNED_HANDOVER_META_KEY = "signedHandoverVersion";
export const SIGNED_HANDOVER_VERSION = "v2";

/** Fixed checklist for Tracker launch-prep tickets (English). */
export const SIGNED_LAUNCH_CHECKLIST_TITLES = [
  "Tariff setup",
  "Credit limit setup",
  "Review/configure special client conditions (if any)",
  "Obtain/connect credit card",
  "Review contract and agreed terms",
] as const;

export type SignedHandoverSettings = {
  defaultAccountManagerUserId: string | null;
  defaultAccountManagerName: string | null;
  trackerProjectId: string | null;
  updatedAt: string;
};

export type ResolvedAccountManager = {
  userId: string;
  name: string;
  source: "settings" | "email_fallback" | "explicit";
};

const SETTINGS_ROW_ID = "default";

function mapSettingsRow(row: Record<string, unknown> | null): SignedHandoverSettings {
  return {
    defaultAccountManagerUserId:
      typeof row?.default_account_manager_user_id === "string"
        ? row.default_account_manager_user_id
        : null,
    defaultAccountManagerName:
      typeof row?.default_account_manager_name === "string"
        ? row.default_account_manager_name
        : null,
    trackerProjectId:
      typeof row?.tracker_project_id === "string" ? row.tracker_project_id : null,
    updatedAt: String(row?.updated_at ?? new Date().toISOString()),
  };
}

export async function getSignedHandoverSettings(): Promise<SignedHandoverSettings> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("sales_signed_handover_settings")
    .select("*")
    .eq("id", SETTINGS_ROW_ID)
    .maybeSingle();
  if (error) {
    // Table may not exist yet — return empty defaults.
    console.error("getSignedHandoverSettings:", error.message);
    return {
      defaultAccountManagerUserId: null,
      defaultAccountManagerName: null,
      trackerProjectId: null,
      updatedAt: new Date().toISOString(),
    };
  }
  if (!data) {
    const { data: inserted, error: insertError } = await supabase
      .from("sales_signed_handover_settings")
      .upsert({ id: SETTINGS_ROW_ID, updated_at: new Date().toISOString() }, { onConflict: "id" })
      .select("*")
      .single();
    if (insertError) {
      console.error("seed signed handover settings:", insertError.message);
      return mapSettingsRow(null);
    }
    return mapSettingsRow(inserted as Record<string, unknown>);
  }
  return mapSettingsRow(data as Record<string, unknown>);
}

export async function updateSignedHandoverSettings(input: {
  defaultAccountManagerUserId?: string | null;
  defaultAccountManagerName?: string | null;
  trackerProjectId?: string | null;
}): Promise<SignedHandoverSettings> {
  const supabase = getSupabaseAdminClient();
  const now = new Date().toISOString();
  const payload: Record<string, unknown> = {
    id: SETTINGS_ROW_ID,
    updated_at: now,
  };
  if (input.defaultAccountManagerUserId !== undefined) {
    payload.default_account_manager_user_id = input.defaultAccountManagerUserId;
  }
  if (input.defaultAccountManagerName !== undefined) {
    payload.default_account_manager_name = input.defaultAccountManagerName;
  }
  if (input.trackerProjectId !== undefined) {
    payload.tracker_project_id = input.trackerProjectId;
  }
  const { data, error } = await supabase
    .from("sales_signed_handover_settings")
    .upsert(payload, { onConflict: "id" })
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? "Failed to update signed handover settings.");
  }
  return mapSettingsRow(data as Record<string, unknown>);
}

/** Pure helper for tests: pick AM from settings fields + optional email fallback user. */
export function pickDefaultAccountManager(input: {
  settingsUserId: string | null;
  settingsName: string | null;
  fallbackUser: { id: string; name: string } | null;
  explicit?: { userId: string; name: string } | null;
}): ResolvedAccountManager | null {
  if (input.explicit?.userId) {
    return {
      userId: input.explicit.userId,
      name: input.explicit.name || input.explicit.userId,
      source: "explicit",
    };
  }
  if (input.settingsUserId) {
    return {
      userId: input.settingsUserId,
      name: input.settingsName || input.settingsUserId,
      source: "settings",
    };
  }
  if (input.fallbackUser) {
    return {
      userId: input.fallbackUser.id,
      name: input.fallbackUser.name || input.fallbackUser.id,
      source: "email_fallback",
    };
  }
  return null;
}

export async function resolveDefaultAccountManager(explicit?: {
  userId: string | null;
  name: string | null;
} | null): Promise<ResolvedAccountManager | null> {
  if (explicit?.userId) {
    return pickDefaultAccountManager({
      settingsUserId: null,
      settingsName: null,
      fallbackUser: null,
      explicit: { userId: explicit.userId, name: explicit.name || explicit.userId },
    });
  }
  const settings = await getSignedHandoverSettings();
  let fallback: { id: string; name: string } | null = null;
  try {
    const user = await findUserByEmail(DEFAULT_SIGNED_AM_EMAIL);
    if (user) fallback = { id: user.id, name: user.name };
  } catch (error) {
    console.error("resolveDefaultAccountManager email lookup:", error);
  }
  return pickDefaultAccountManager({
    settingsUserId: settings.defaultAccountManagerUserId,
    settingsName: settings.defaultAccountManagerName,
    fallbackUser: fallback,
  });
}

export function buildLaunchTicketTitle(clientLabel: string): string {
  const label = clientLabel.trim() || "Client";
  return `Launch prep — ${label}`;
}

export function nextBusinessDayMeetingWindow(from: Date = new Date()): {
  startsAt: string;
  endsAt: string;
} {
  const d = new Date(from.getTime());
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() + 1);
  }
  d.setHours(10, 0, 0, 0);
  const end = new Date(d.getTime() + 45 * 60 * 1000);
  return { startsAt: d.toISOString(), endsAt: end.toISOString() };
}

async function alreadyRanSignedHandoverV2(leadId: string): Promise<boolean> {
  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("sales_activities")
      .select("id, meta")
      .eq("lead_id", leadId)
      .contains("meta", { [SIGNED_HANDOVER_META_KEY]: SIGNED_HANDOVER_VERSION })
      .limit(1);
    if (error) {
      console.error("alreadyRanSignedHandoverV2:", error.message);
      return false;
    }
    return (data?.length ?? 0) > 0;
  } catch (error) {
    console.error("alreadyRanSignedHandoverV2:", error);
    return false;
  }
}

export async function createSignedLaunchTrackerTicket(input: {
  projectId: string;
  clientLabel: string;
  leadId: string;
  am: { userId: string; name: string };
  actor: { userId: string | null; name: string };
  dueAt?: string | null;
}): Promise<{ ticketId: string } | null> {
  const statuses = await listTrackerStatuses(input.projectId);
  const status =
    statuses.find((s) => !s.isDone) ??
    statuses.sort((a, b) => a.position - b.position)[0] ??
    null;
  if (!status) {
    console.warn(
      "Signed handover: Tracker project has no statuses; skip launch ticket.",
      input.projectId,
    );
    return null;
  }

  const ticket = await createTrackerTicket(
    input.projectId,
    {
      title: buildLaunchTicketTitle(input.clientLabel),
      description: `Prepare signed client for launch.\nLead: ${input.leadId}`,
      statusId: status.id,
      priority: "high",
      dueAt: input.dueAt ?? null,
      assigneeUserIds: [{ userId: input.am.userId, userName: input.am.name }],
    },
    input.actor,
  );

  for (const title of SIGNED_LAUNCH_CHECKLIST_TITLES) {
    await addChecklistItem(ticket.id, title, input.actor);
  }

  return { ticketId: ticket.id };
}

/**
 * Post-Signed automation: Onboarding + First Touch task, calendar meeting,
 * Tracker launch-prep ticket. Best-effort; never throws to the caller.
 */
export async function runSignedHandoverV2(input: {
  lead: SalesLead;
  actor: { userId: string | null; name: string };
  accountManagerUserId: string | null;
  accountManagerName: string | null;
  clientId: string | null;
}): Promise<void> {
  try {
    if (await alreadyRanSignedHandoverV2(input.lead.id)) {
      return;
    }

    const am = await resolveDefaultAccountManager({
      userId: input.accountManagerUserId,
      name: input.accountManagerName,
    });
    if (!am) {
      console.warn("Signed handover v2: no Account Manager resolved; skipping task/meeting/ticket.");
      await logActivity({
        leadId: input.lead.id,
        type: "other",
        title: "Signed handover skipped",
        body: "No Account Manager configured.",
        meta: { [SIGNED_HANDOVER_META_KEY]: SIGNED_HANDOVER_VERSION, skipped: true },
        actor: input.actor,
      });
      return;
    }

    const clientLabel =
      input.lead.companyName?.trim() || input.lead.fullName?.trim() || "Client";
    const dueAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();

    try {
      await createSalesTask(
        input.lead.id,
        {
          title: ONBOARDING_FIRST_TOUCH_TITLE,
          description: `Onboarding and first touch for ${clientLabel}. Capture outcomes in the task summary when done.`,
          taskType: "call",
          priority: "high",
          dueAt,
          assignedToUserId: am.userId,
          assignedToName: am.name,
        },
        input.actor,
      );
    } catch (error) {
      console.error("Signed handover: onboarding task failed:", error);
    }

    try {
      const window = nextBusinessDayMeetingWindow();
      await createMeeting(am.userId, {
        title: ONBOARDING_FIRST_TOUCH_TITLE,
        description: `First touch / onboarding with ${clientLabel}.`,
        startsAt: window.startsAt,
        endsAt: window.endsAt,
        clientId: input.clientId,
      });
    } catch (error) {
      console.error("Signed handover: calendar meeting failed:", error);
    }

    const settings = await getSignedHandoverSettings();
    if (settings.trackerProjectId) {
      try {
        await createSignedLaunchTrackerTicket({
          projectId: settings.trackerProjectId,
          clientLabel,
          leadId: input.lead.id,
          am: { userId: am.userId, name: am.name },
          actor: input.actor,
          dueAt,
        });
      } catch (error) {
        console.error("Signed handover: Tracker ticket failed:", error);
      }
    } else {
      console.warn(
        "Signed handover: tracker_project_id not configured; skip launch-prep ticket.",
      );
    }

    if (am.userId !== input.actor.userId) {
      await createNotification({
        userId: am.userId,
        type: "system",
        title: `Signed client: ${clientLabel}`,
        body: "Onboarding + First Touch assigned to you.",
        leadId: input.lead.id,
        link: "/sales-operation/tracker",
      });
    }

    await logActivity({
      leadId: input.lead.id,
      type: "other",
      title: "Signed handover completed",
      body: `Account Manager ${am.name} · Onboarding + First Touch · launch prep.`,
      meta: {
        [SIGNED_HANDOVER_META_KEY]: SIGNED_HANDOVER_VERSION,
        accountManagerUserId: am.userId,
        trackerProjectId: settings.trackerProjectId,
      },
      actor: input.actor,
    });
  } catch (error) {
    console.error("runSignedHandoverV2 failed:", error);
  }
}
