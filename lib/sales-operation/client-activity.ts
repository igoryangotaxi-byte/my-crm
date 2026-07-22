import { getSupabaseAdminClient } from "@/lib/supabase";
import { createPersonalNote, createPersonalTask } from "@/lib/sales-operation/personal-space";
import { listMeetingsForClient } from "@/lib/sales-operation/meetings";
import {
  createSalesClientNote,
  getSalesClientById,
  listSalesClientNotes,
} from "@/lib/sales-operation/repository";
import type { PersonalTask, SalesClientNote } from "@/lib/sales-operation/types";
import type { SalesMeeting } from "@/lib/sales-operation/meetings";

export type ClientActivityItem = {
  id: string;
  kind: "note" | "task" | "meeting" | "email" | "system";
  title: string;
  body: string | null;
  createdAt: string;
  meta?: Record<string, unknown>;
};

export async function listClientActivity(clientId: string): Promise<ClientActivityItem[]> {
  const client = await getSalesClientById(clientId);
  if (!client) throw new Error("Client not found.");

  const supabase = getSupabaseAdminClient();
  const [notes, meetings, tasksRes, emailsRes, activitiesRes] = await Promise.all([
    listSalesClientNotes(clientId),
    listMeetingsForClient(clientId),
    supabase
      .from("sales_personal_tasks")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(100),
    client.leadId
      ? supabase
          .from("sales_email_messages")
          .select("id, subject, body, from_address, to_address, status, occurred_at, created_at")
          .eq("lead_id", client.leadId)
          .order("occurred_at", { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [], error: null }),
    client.leadId
      ? supabase
          .from("sales_activities")
          .select("id, type, title, body, actor_name, occurred_at, created_at")
          .eq("lead_id", client.leadId)
          .order("occurred_at", { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (tasksRes.error) throw new Error(tasksRes.error.message);
  if (emailsRes.error) throw new Error(emailsRes.error.message);
  if (activitiesRes.error) throw new Error(activitiesRes.error.message);

  const items: ClientActivityItem[] = [];

  for (const note of notes) {
    items.push({
      id: `note:${note.id}`,
      kind: "note",
      title: note.authorName || "Note",
      body: note.body,
      createdAt: note.createdAt,
      meta: { noteId: note.id, authorUserId: note.authorUserId },
    });
  }

  for (const meeting of meetings) {
    items.push({
      id: `meeting:${meeting.id}`,
      kind: "meeting",
      title: meeting.title,
      body: meeting.description,
      createdAt: meeting.createdAt,
      meta: {
        meetingId: meeting.id,
        startsAt: meeting.startsAt,
        endsAt: meeting.endsAt,
        googleEventId: meeting.googleEventId,
      },
    });
  }

  for (const row of tasksRes.data ?? []) {
    items.push({
      id: `task:${row.id}`,
      kind: "task",
      title: String(row.title ?? "Task"),
      body: typeof row.description === "string" ? row.description : null,
      createdAt: String(row.created_at ?? new Date().toISOString()),
      meta: {
        taskId: row.id,
        status: row.status,
        dueAt: row.due_at,
        priority: row.priority,
      },
    });
  }

  for (const row of emailsRes.data ?? []) {
    items.push({
      id: `email:${row.id}`,
      kind: "email",
      title: typeof row.subject === "string" && row.subject.trim() ? row.subject : "Email",
      body: typeof row.body === "string" ? row.body : null,
      createdAt: String(row.occurred_at ?? row.created_at ?? new Date().toISOString()),
      meta: {
        emailId: row.id,
        from: row.from_address,
        to: row.to_address,
        status: row.status,
      },
    });
  }

  for (const row of activitiesRes.data ?? []) {
    const type = String(row.type ?? "system");
    if (type === "email" || type === "meeting") continue;
    items.push({
      id: `activity:${row.id}`,
      kind: "system",
      title:
        (typeof row.title === "string" && row.title.trim()
          ? row.title
          : type) + (row.actor_name ? ` · ${row.actor_name}` : ""),
      body: typeof row.body === "string" ? row.body : null,
      createdAt: String(row.occurred_at ?? row.created_at ?? new Date().toISOString()),
      meta: { activityId: row.id, type },
    });
  }

  items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return items;
}

export async function addClientNoteWithPersonalSync(input: {
  clientId: string;
  body: string;
  actor: { userId: string; name: string; email: string | null };
}): Promise<{ note: SalesClientNote }> {
  const note = await createSalesClientNote({
    clientId: input.clientId,
    body: input.body,
    authorUserId: input.actor.userId,
    authorName: input.actor.name,
  });

  try {
    await createPersonalNote(
      { userId: input.actor.userId, email: input.actor.email },
      {
        title: `Client note`,
        body: input.body,
        clientId: input.clientId,
        sourceClientNoteId: note.id,
      },
    );
  } catch (error) {
    console.error("Failed to mirror client note to My Space:", error);
  }

  return { note };
}

export async function addClientTaskToPersonalSpace(input: {
  clientId: string;
  leadId?: string | null;
  title: string;
  description?: string | null;
  dueAt?: string | null;
  priority?: "low" | "normal" | "high";
  actor: { userId: string; email: string | null };
}): Promise<PersonalTask> {
  return createPersonalTask(
    { userId: input.actor.userId, email: input.actor.email },
    {
      title: input.title,
      description: input.description,
      dueAt: input.dueAt,
      priority: input.priority,
      clientId: input.clientId,
      leadId: input.leadId ?? null,
      sourceClientId: input.clientId,
    },
  );
}

export type { SalesMeeting, SalesClientNote };
