import { getSupabaseAdminClient, isSupabaseConfigured } from "@/lib/supabase";
import { createNotification } from "@/lib/sales-operation/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Emits `task_due` in-app notifications for open tasks that are overdue or due
 * within the next 24h. Purely additive: reads existing tasks and writes
 * notifications only. Protected by CRON_SECRET (Vercel Cron sends it as a
 * bearer token; a `?secret=` query param is also accepted for manual runs).
 */
function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // No secret configured — allow (e.g. local/dev).
  const header = request.headers.get("authorization");
  if (header === `Bearer ${secret}`) return true;
  const url = new URL(request.url);
  return url.searchParams.get("secret") === secret;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const supabase = getSupabaseAdminClient();
  const now = new Date();
  const horizon = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const dedupeSince = new Date(now.getTime() - 20 * 60 * 60 * 1000);

  try {
    const { data: taskRows, error } = await supabase
      .from("sales_tasks")
      .select("id, lead_id, title, due_at, assigned_to_user_id, status")
      .eq("status", "open")
      .not("assigned_to_user_id", "is", null)
      .not("due_at", "is", null)
      .lte("due_at", horizon.toISOString());
    if (error) throw new Error(error.message);

    // Dedupe against reminders already sent in the last ~20h (same user + title).
    const { data: recent } = await supabase
      .from("sales_notifications")
      .select("user_id, title, created_at")
      .eq("type", "task_due")
      .gte("created_at", dedupeSince.toISOString());
    const seen = new Set(
      (recent ?? []).map((row) => `${String(row.user_id)}::${String(row.title)}`),
    );

    let sent = 0;
    for (const row of (taskRows ?? []) as Record<string, unknown>[]) {
      const userId = row.assigned_to_user_id as string | null;
      const title = String(row.title ?? "").trim();
      if (!userId || !title) continue;
      const dueAt = row.due_at ? new Date(String(row.due_at)) : null;
      const overdue = dueAt ? dueAt.getTime() < now.getTime() : false;
      const notificationTitle = `${overdue ? "Overdue task" : "Task due soon"}: ${title}`;
      const dedupeKey = `${userId}::${notificationTitle}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      await createNotification({
        userId,
        type: "task_due",
        title: notificationTitle,
        body: dueAt ? `Due ${dueAt.toLocaleString()}` : null,
        leadId: typeof row.lead_id === "string" ? row.lead_id : null,
        link: "/sales-operation/tasks",
      });
      sent += 1;
    }

    return Response.json({ ok: true, checked: (taskRows ?? []).length, sent });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to run reminders." },
      { status: 500 },
    );
  }
}
