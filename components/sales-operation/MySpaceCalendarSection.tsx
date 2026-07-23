"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { CalendarPlus, CheckSquare, Link2, Link2Off, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/ui/cn";
import type { PersonalTask, SalesTaskWithLead } from "@/lib/sales-operation/types";
import type { SalesMeeting } from "@/lib/sales-operation/meetings";
import type { TrackerTicket } from "@/lib/sales-operation/tracker-types";
import { MeetingDetailDrawer } from "@/components/sales-operation/MeetingDetailDrawer";
import { TaskDetailDrawer } from "@/components/sales-operation/tasks/TaskDetailDrawer";

type CalendarEvent = {
  id: string;
  kind: "meeting" | "personal_task" | "lead_task" | "tracker_ticket";
  title: string;
  startsAt: Date;
  endsAt: Date;
  meta?: { meetingId?: string; taskId?: string; href?: string };
};

type SelectedTask = { kind: "personal" | "lead"; id: string };

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function toLocalInput(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function MySpaceCalendarSection() {
  const t = useTranslations("salesOperation");
  const toast = useToast();
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [meetings, setMeetings] = useState<SalesMeeting[]>([]);
  const [personalTasks, setPersonalTasks] = useState<PersonalTask[]>([]);
  const [leadTasks, setLeadTasks] = useState<SalesTaskWithLead[]>([]);
  const [trackerTickets, setTrackerTickets] = useState<TrackerTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [gcalConnected, setGcalConnected] = useState(false);
  const [gcalConfigured, setGcalConfigured] = useState(false);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState(() => toLocalInput(new Date()));
  const [endsAt, setEndsAt] = useState(() => {
    const d = new Date();
    d.setHours(d.getHours() + 1);
    return toLocalInput(d);
  });
  const [selectedTask, setSelectedTask] = useState<SelectedTask | null>(null);
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);

  const selectedPersonalTask = useMemo(
    () =>
      selectedTask?.kind === "personal"
        ? (personalTasks.find((task) => task.id === selectedTask.id) ?? null)
        : null,
    [personalTasks, selectedTask],
  );
  const selectedMeeting = useMemo(
    () => meetings.find((meeting) => meeting.id === selectedMeetingId) ?? null,
    [meetings, selectedMeetingId],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const from = startOfMonth(cursor).toISOString();
      const to = addDays(startOfMonth(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)), -1);
      to.setHours(23, 59, 59, 999);
      const [meetingsRes, personalRes, leadRes, trackerRes, statusRes] = await Promise.all([
        fetch(
          `/api/sales-operation/meetings?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to.toISOString())}`,
          { cache: "no-store" },
        ),
        fetch("/api/sales-operation/personal/tasks?status=open", { cache: "no-store" }),
        fetch("/api/sales-operation/tasks?scope=mine&status=open", { cache: "no-store" }),
        fetch("/api/sales-operation/tracker/mine?scope=mine&includeDone=1", { cache: "no-store" }),
        fetch("/api/google/calendar/status", { cache: "no-store" }),
      ]);
      const meetingsData = (await meetingsRes.json()) as {
        ok?: boolean;
        meetings?: SalesMeeting[];
      };
      const personalData = (await personalRes.json()) as { ok?: boolean; tasks?: PersonalTask[] };
      const leadData = (await leadRes.json()) as { ok?: boolean; tasks?: SalesTaskWithLead[] };
      const trackerData = (await trackerRes.json()) as {
        ok?: boolean;
        tickets?: TrackerTicket[];
      };
      const statusData = (await statusRes.json()) as {
        ok?: boolean;
        connected?: boolean;
        configured?: boolean;
      };
      if (meetingsRes.ok && meetingsData.ok) setMeetings(meetingsData.meetings ?? []);
      if (personalRes.ok && personalData.ok) setPersonalTasks(personalData.tasks ?? []);
      if (leadRes.ok && leadData.ok) setLeadTasks(leadData.tasks ?? []);
      if (trackerRes.ok && trackerData.ok) setTrackerTickets(trackerData.tickets ?? []);
      if (statusRes.ok && statusData.ok) {
        setGcalConnected(Boolean(statusData.connected));
        setGcalConfigured(Boolean(statusData.configured));
      }
    } finally {
      setLoading(false);
    }
  }, [cursor]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gcal = params.get("gcal");
    if (gcal === "connected") toast.success(t("calendar.connected"));
    if (gcal === "error") toast.error(t("calendar.connectFailed"));
  }, [t, toast]);

  const events = useMemo(() => {
    const list: CalendarEvent[] = [];
    for (const meeting of meetings) {
      list.push({
        id: `m:${meeting.id}`,
        kind: "meeting",
        title: meeting.title,
        startsAt: new Date(meeting.startsAt),
        endsAt: new Date(meeting.endsAt),
        meta: { meetingId: meeting.id },
      });
    }
    for (const task of personalTasks) {
      if (!task.dueAt) continue;
      const due = new Date(task.dueAt);
      list.push({
        id: `pt:${task.id}`,
        kind: "personal_task",
        title: task.title,
        startsAt: due,
        endsAt: due,
        meta: { taskId: task.id },
      });
    }
    for (const task of leadTasks) {
      if (!task.dueAt) continue;
      const due = new Date(task.dueAt);
      const leadLabel = task.leadCompanyName || task.leadName;
      list.push({
        id: `lt:${task.id}`,
        kind: "lead_task",
        title: leadLabel ? `${task.title} · ${leadLabel}` : task.title,
        startsAt: due,
        endsAt: due,
        meta: { taskId: task.id },
      });
    }
    for (const ticket of trackerTickets) {
      if (!ticket.dueAt || ticket.archivedAt) continue;
      const due = new Date(ticket.dueAt);
      list.push({
        id: `tt:${ticket.id}`,
        kind: "tracker_ticket",
        title: ticket.projectName ? `${ticket.title} · ${ticket.projectName}` : ticket.title,
        startsAt: due,
        endsAt: due,
        meta: {
          href: `/sales-operation/tracker/${ticket.projectId}?ticket=${ticket.id}`,
        },
      });
    }
    return list;
  }, [meetings, personalTasks, leadTasks, trackerTickets]);

  const days = useMemo(() => {
    const first = startOfMonth(cursor);
    const startPad = (first.getDay() + 6) % 7; // Monday-first
    const gridStart = addDays(first, -startPad);
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  }, [cursor]);

  const createMeeting = async () => {
    if (!title.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/sales-operation/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          startsAt: new Date(startsAt).toISOString(),
          endsAt: new Date(endsAt).toISOString(),
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; googleSynced?: boolean };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed to create meeting.");
      setTitle("");
      toast.success(
        data.googleSynced ? t("calendar.meetingSynced") : t("calendar.meetingCreated"),
      );
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("calendar.meetingFailed"));
    } finally {
      setCreating(false);
    }
  };

  const disconnect = async () => {
    const res = await fetch("/api/google/calendar/status", { method: "DELETE" });
    if (res.ok) {
      setGcalConnected(false);
      toast.success(t("calendar.disconnected"));
    }
  };

  const openTask = (kind: "personal" | "lead", taskId: string) => {
    setSelectedMeetingId(null);
    setSelectedTask({ kind, id: taskId });
  };

  const openMeeting = (meetingId: string) => {
    setSelectedTask(null);
    setSelectedMeetingId(meetingId);
  };

  const monthLabel = cursor.toLocaleString(undefined, { month: "long", year: "numeric" });

  const eventTone = (kind: CalendarEvent["kind"], active: boolean) => {
    if (kind === "meeting") {
      return cn("bg-sky-50 text-sky-800 hover:bg-sky-100", active && "ring-1 ring-sky-400");
    }
    if (kind === "lead_task") {
      return cn(
        "bg-violet-50 text-violet-800 hover:bg-violet-100",
        active && "ring-1 ring-violet-400",
      );
    }
    if (kind === "tracker_ticket") {
      return cn(
        "bg-emerald-50 text-emerald-800 hover:bg-emerald-100",
        active && "ring-1 ring-emerald-400",
      );
    }
    return cn("bg-amber-50 text-amber-800 hover:bg-amber-100", active && "ring-1 ring-amber-400");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
          >
            ←
          </Button>
          <h2 className="min-w-[10rem] text-center text-sm font-semibold capitalize text-[var(--so-text)]">
            {monthLabel}
          </h2>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
          >
            →
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs text-[var(--so-muted)]">
            <span className="h-2.5 w-2.5 rounded-full bg-sky-500" /> {t("calendar.legendMeeting")}
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs text-[var(--so-muted)]">
            <span className="h-2.5 w-2.5 rounded-full bg-violet-500" /> {t("calendar.legendLeadTask")}
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs text-[var(--so-muted)]">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> {t("calendar.legendTask")}
          </span>
          {gcalConfigured ? (
            gcalConnected ? (
              <Button size="sm" variant="secondary" onClick={() => void disconnect()}>
                <Link2Off className="mr-1.5 h-3.5 w-3.5" />
                {t("calendar.disconnect")}
              </Button>
            ) : (
              <a
                href="/api/google/calendar/connect?returnTo=/sales-operation/calendar"
                className="so-focus-ring inline-flex h-8 items-center rounded-[10px] border border-[var(--so-border-strong)] bg-[var(--so-surface)] px-3 text-xs font-semibold text-[var(--so-text)] hover:bg-[var(--so-surface-hover)]"
              >
                <Link2 className="mr-1.5 h-3.5 w-3.5" />
                {t("calendar.connect")}
              </a>
            )
          ) : null}
        </div>
      </div>

      <div className="rounded-[14px] border border-[var(--so-border)] bg-[var(--so-surface)] p-3">
        <p className="mb-2 text-xs font-semibold text-[var(--so-muted)]">{t("calendar.newMeeting")}</p>
        <div className="flex flex-wrap gap-2">
          <input
            className="crm-input h-9 min-w-[12rem] flex-1 px-2.5 text-sm"
            placeholder={t("calendar.meetingTitle")}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <input
            type="datetime-local"
            className="crm-input h-9 px-2.5 text-sm"
            value={startsAt}
            onChange={(event) => setStartsAt(event.target.value)}
          />
          <input
            type="datetime-local"
            className="crm-input h-9 px-2.5 text-sm"
            value={endsAt}
            onChange={(event) => setEndsAt(event.target.value)}
          />
          <Button
            size="sm"
            loading={creating}
            disabled={creating || !title.trim()}
            onClick={() => void createMeeting()}
          >
            <CalendarPlus className="mr-1.5 h-3.5 w-3.5" />
            {t("calendar.add")}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-[var(--so-muted)]">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : (
        <div className="overflow-hidden rounded-[14px] border border-[var(--so-border)] bg-[var(--so-surface)]">
          <div className="grid grid-cols-7 border-b border-[var(--so-border)] bg-[var(--so-surface-2)] text-center text-[0.65rem] font-bold uppercase tracking-wide text-[var(--so-muted)]">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div key={d} className="px-1 py-2">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((day) => {
              const inMonth = day.getMonth() === cursor.getMonth();
              const dayEvents = events.filter((event) => sameDay(event.startsAt, day));
              const isToday = sameDay(day, new Date());
              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    "min-h-[6.5rem] border-b border-r border-[var(--so-border)] p-1.5",
                    !inMonth && "bg-[var(--so-surface-2)]/60",
                  )}
                >
                  <div
                    className={cn(
                      "mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                      isToday
                        ? "bg-[var(--so-accent)] text-white"
                        : inMonth
                          ? "text-[var(--so-text)]"
                          : "text-[var(--so-muted-2)]",
                    )}
                  >
                    {day.getDate()}
                  </div>
                  <div className="max-h-[5.5rem] space-y-0.5 overflow-y-auto">
                    {dayEvents.map((event) => {
                      const taskId = event.meta?.taskId;
                      const meetingId = event.meta?.meetingId;
                      const active =
                        (taskId &&
                          selectedTask?.id === taskId &&
                          ((event.kind === "personal_task" && selectedTask.kind === "personal") ||
                            (event.kind === "lead_task" && selectedTask.kind === "lead"))) ||
                        (meetingId && selectedMeetingId === meetingId);
                      return (
                        <button
                          key={event.id}
                          type="button"
                          title={event.title}
                          onClick={() => {
                            if (event.kind === "personal_task" && taskId) openTask("personal", taskId);
                            else if (event.kind === "lead_task" && taskId) openTask("lead", taskId);
                            else if (event.kind === "meeting" && meetingId) openMeeting(meetingId);
                            else if (event.kind === "tracker_ticket" && event.meta?.href) {
                              window.location.href = event.meta.href;
                            }
                          }}
                          className={cn(
                            "block w-full truncate rounded px-1 py-0.5 text-left text-[0.65rem] font-semibold transition-colors",
                            eventTone(event.kind, Boolean(active)),
                          )}
                        >
                          {event.kind !== "meeting" ? (
                            <CheckSquare className="mr-0.5 inline h-2.5 w-2.5" />
                          ) : null}
                          {event.title}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <TaskDetailDrawer
        open={Boolean(selectedTask)}
        onOpenChange={(open) => {
          if (!open) setSelectedTask(null);
        }}
        kind={selectedTask?.kind ?? "personal"}
        taskId={selectedTask?.id ?? null}
        seedPersonalTask={selectedPersonalTask}
        onChanged={() => void load()}
      />

      <MeetingDetailDrawer
        open={Boolean(selectedMeetingId)}
        onOpenChange={(open) => {
          if (!open) setSelectedMeetingId(null);
        }}
        meeting={selectedMeeting}
        onChanged={() => void load()}
      />
    </div>
  );
}
