"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  CalendarClock,
  Check,
  Gauge,
  Inbox,
  ListChecks,
  Lock,
  Pin,
  PinOff,
  Plus,
  StickyNote,
  Trash2,
  X,
} from "lucide-react";
import { formatSalesDateTime } from "@/lib/sales-operation/display";
import { sortTasks, taskDueBucket, type TaskDueBucket } from "@/lib/sales-operation/task-utils";
import { MyScorecardSection } from "@/components/sales-operation/MyScorecardSection";
import { TaskDetailDrawer } from "@/components/sales-operation/tasks/TaskDetailDrawer";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Tabs } from "@/components/ui/Tabs";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { cn } from "@/lib/ui/cn";
import type {
  PersonalNote,
  PersonalTask,
  SalesTaskPriority,
  SalesTaskWithLead,
} from "@/lib/sales-operation/types";

type SpaceTab = "tasks" | "assigned" | "created" | "notes" | "scorecard";

const BUCKET_ORDER: TaskDueBucket[] = ["overdue", "today", "upcoming", "no_due", "done"];

const bucketTone: Record<TaskDueBucket, string> = {
  overdue: "text-rose-600",
  today: "text-amber-600",
  upcoming: "text-[var(--so-muted)]",
  no_due: "text-[var(--so-muted-2)]",
  done: "text-[var(--so-muted-2)]",
};

const TAB_ICONS: Record<SpaceTab, React.ReactNode> = {
  tasks: <ListChecks className="h-4 w-4" />,
  assigned: <Inbox className="h-4 w-4" />,
  created: <ListChecks className="h-4 w-4" />,
  notes: <StickyNote className="h-4 w-4" />,
  scorecard: <Gauge className="h-4 w-4" />,
};

function StatusFilter({
  value,
  onChange,
  t,
}: {
  value: "open" | "done" | "all";
  onChange: (value: "open" | "done" | "all") => void;
  t: (key: string) => string;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-[10px] border border-[var(--so-border)] bg-[var(--so-surface-2)] p-0.5">
      {(["open", "done", "all"] as const).map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={cn(
            "rounded-[8px] px-2.5 py-1 text-xs font-semibold transition-colors",
            value === option
              ? "bg-[var(--so-surface)] text-[var(--so-text)] shadow-[var(--so-shadow-xs)]"
              : "text-[var(--so-muted)] hover:text-[var(--so-text)]",
          )}
        >
          {t(`tasks.status.${option}`)}
        </button>
      ))}
    </div>
  );
}

function Checkbox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onChange}
      className={cn(
        "so-focus-ring mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[6px] border transition-colors",
        checked
          ? "border-[var(--so-accent)] bg-[var(--so-accent)] text-white"
          : "border-[var(--so-border-strong)] bg-[var(--so-surface)] hover:border-[var(--so-accent)]",
      )}
    >
      {checked ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
    </button>
  );
}

function TaskListSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="flex items-start gap-3 rounded-[14px] border border-[var(--so-border)] bg-[var(--so-surface)] px-4 py-3"
        >
          <Skeleton className="mt-0.5 h-[18px] w-[18px] rounded-[6px]" />
          <div className="flex-1">
            <Skeleton className="h-4" style={{ width: `${45 + i * 10}%` }} />
            <Skeleton className="mt-2 h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function MySpaceView() {
  const t = useTranslations("salesOperation");
  const [tab, setTab] = useState<SpaceTab>("tasks");

  const tabs: SpaceTab[] = ["tasks", "assigned", "created", "notes", "scorecard"];
  const showPrivacyHint = tab === "tasks" || tab === "notes";

  return (
    <div className="pb-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={tab}
          onValueChange={setTab}
          items={tabs.map((value) => ({
            value,
            label: t(`mySpace.tab.${value}`),
            icon: TAB_ICONS[value],
          }))}
        />
        {showPrivacyHint ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-[var(--so-muted)]">
            <Lock className="h-3.5 w-3.5" />
            {t("mySpace.privacyHint")}
          </span>
        ) : null}
      </div>

      {tab === "tasks" ? <PersonalTasksSection /> : null}
      {tab === "assigned" ? <LeadTasksSection scope="mine" /> : null}
      {tab === "created" ? <LeadTasksSection scope="created" showAssignee /> : null}
      {tab === "notes" ? <PersonalNotesSection /> : null}
      {tab === "scorecard" ? <MyScorecardSection /> : null}
    </div>
  );
}

function PersonalTasksSection() {
  const t = useTranslations("salesOperation");
  const { success: toastSuccess, error: toastError } = useToast();
  const confirm = useConfirm();
  const [tasks, setTasks] = useState<PersonalTask[]>([]);
  const [statusFilter, setStatusFilter] = useState<"open" | "done" | "all">("open");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drawerTask, setDrawerTask] = useState<PersonalTask | null>(null);

  const [expanded, setExpanded] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<SalesTaskPriority>("normal");
  const [dueAt, setDueAt] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/sales-operation/personal/tasks?status=${statusFilter}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as { ok?: boolean; tasks?: PersonalTask[]; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed to load tasks.");
      setTasks(data.tasks ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tasks.");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const createTask = async () => {
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      priority,
      dueAt: dueAt || null,
    };
    try {
      const res = await fetch("/api/sales-operation/personal/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { ok?: boolean; task?: PersonalTask; error?: string };
      if (!res.ok || !data.ok || !data.task) throw new Error(data.error ?? "Failed to create task.");
      if (statusFilter !== "done") {
        setTasks((prev) => [data.task!, ...prev]);
      }
      setTitle("");
      setDescription("");
      setPriority("normal");
      setDueAt("");
      setExpanded(false);
      toastSuccess(t("mySpace.tasks.created"));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create task.";
      setError(message);
      toastError(message);
    } finally {
      setSaving(false);
    }
  };

  const toggleTask = async (task: PersonalTask) => {
    const nextStatus: PersonalTask["status"] = task.status === "done" ? "open" : "done";
    const snapshot = tasks;
    // Optimistic: flip immediately (and drop from list when filter no longer matches).
    setTasks((prev) =>
      prev
        .map((item) => (item.id === task.id ? { ...item, status: nextStatus } : item))
        .filter((item) => {
          if (statusFilter === "all") return true;
          return statusFilter === "done" ? item.status === "done" : item.status === "open";
        }),
    );
    try {
      const res = await fetch(`/api/sales-operation/personal/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = (await res.json()) as { ok?: boolean; task?: PersonalTask; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed to update task.");
      if (data.task) {
        setTasks((prev) =>
          prev
            .map((item) => (item.id === data.task!.id ? data.task! : item))
            .filter((item) => {
              if (statusFilter === "all") return true;
              return statusFilter === "done" ? item.status === "done" : item.status === "open";
            }),
        );
      }
    } catch (err) {
      setTasks(snapshot);
      toastError(err instanceof Error ? err.message : "Failed to update task.");
    }
  };

  const deleteTask = async (task: PersonalTask) => {
    const ok = await confirm({
      title: t("task.deleteConfirm"),
      confirmLabel: t("task.delete"),
      destructive: true,
    });
    if (!ok) return;
    const snapshot = tasks;
    setTasks((prev) => prev.filter((item) => item.id !== task.id));
    try {
      const res = await fetch(`/api/sales-operation/personal/tasks/${task.id}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed to delete task.");
      toastSuccess(t("mySpace.tasks.deleted"));
    } catch (err) {
      setTasks(snapshot);
      toastError(err instanceof Error ? err.message : "Failed to delete task.");
    }
  };

  const cancelForm = () => {
    setExpanded(false);
    setTitle("");
    setDescription("");
    setPriority("normal");
    setDueAt("");
  };

  return (
    <section className="space-y-4">
      {expanded ? (
        <Card padded>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[0.95rem] font-bold tracking-tight text-[var(--so-text)]">
              {t("mySpace.tasks.newTitle")}
            </h2>
            <button
              type="button"
              onClick={cancelForm}
              aria-label={t("cancel")}
              className="so-focus-ring inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--so-muted-2)] transition-colors hover:bg-[var(--so-surface-hover)] hover:text-[var(--so-text)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid gap-2.5 md:grid-cols-2">
            <input
              value={title}
              autoFocus
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t("mySpace.tasks.titlePlaceholder")}
              className="crm-input h-9 px-3 text-sm md:col-span-2"
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) void createTask();
                if (event.key === "Escape") cancelForm();
              }}
            />
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t("mySpace.tasks.descriptionPlaceholder")}
              className="crm-input h-9 px-3 text-sm md:col-span-2"
            />
            <label className="text-xs text-[var(--so-muted)]">
              {t("task.priority.label")}
              <select
                value={priority}
                onChange={(event) => setPriority(event.target.value as SalesTaskPriority)}
                className="crm-input mt-1 block h-9 w-full px-2.5 text-sm"
              >
                <option value="low">{t("task.priority.low")}</option>
                <option value="normal">{t("task.priority.normal")}</option>
                <option value="high">{t("task.priority.high")}</option>
              </select>
            </label>
            <label className="text-xs text-[var(--so-muted)]">
              {t("mySpace.tasks.dueLabel")}
              <input
                type="datetime-local"
                value={dueAt}
                onChange={(event) => setDueAt(event.target.value)}
                className="crm-input mt-1 block h-9 w-full px-2.5 text-sm"
              />
            </label>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="ghost" onClick={cancelForm}>
              {t("cancel")}
            </Button>
            <Button
              leftIcon={<Plus className="h-4 w-4" />}
              loading={saving}
              disabled={saving || !title.trim()}
              onClick={() => void createTask()}
            >
              {t("mySpace.tasks.add")}
            </Button>
          </div>
        </Card>
      ) : (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="so-focus-ring group flex w-full items-center gap-2.5 rounded-[14px] border border-dashed border-[var(--so-border-strong)] bg-[var(--so-surface)] px-4 py-3 text-sm font-semibold text-[var(--so-muted)] transition-colors hover:border-[var(--so-accent)] hover:bg-[var(--so-accent-soft)] hover:text-[var(--so-accent-strong)]"
        >
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--so-accent)] text-white transition-transform group-hover:scale-105">
            <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
          </span>
          {t("mySpace.tasks.newTitle")}
        </button>
      )}

      <StatusFilter value={statusFilter} onChange={setStatusFilter} t={t} />

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      {loading ? (
        <TaskListSkeleton />
      ) : tasks.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ListChecks className="h-5 w-5" />}
            title={t("mySpace.tasks.empty")}
          />
        </Card>
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => {
            const done = task.status === "done";
            return (
              <article
                key={task.id}
                role="button"
                tabIndex={0}
                onClick={() => setDrawerTask(task)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setDrawerTask(task);
                  }
                }}
                className="group flex cursor-pointer items-start gap-3 rounded-[14px] border border-[var(--so-border)] bg-[var(--so-surface)] px-4 py-3 shadow-[var(--so-shadow-xs)] transition-colors hover:border-[var(--so-border-strong)]"
              >
                <div
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  <Checkbox checked={done} onChange={() => void toggleTask(task)} />
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "text-sm font-semibold",
                      done ? "text-[var(--so-muted-2)] line-through" : "text-[var(--so-text)]",
                    )}
                  >
                    {task.title}
                    {task.priority === "high" && !done ? (
                      <span className="ml-2 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">
                        {t("task.priority.high")}
                      </span>
                    ) : null}
                  </p>
                  {task.description ? (
                    <p className="mt-0.5 text-xs text-[var(--so-muted)]">{task.description}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                  {task.dueAt ? (
                    <p className="inline-flex items-center gap-1 text-xs font-medium text-[var(--so-muted)]">
                      <CalendarClock className="h-3.5 w-3.5" />
                      {formatSalesDateTime(task.dueAt)}
                    </p>
                  ) : (
                    <p className="text-xs text-[var(--so-muted-2)]">{t("task.noDue")}</p>
                  )}
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      void deleteTask(task);
                    }}
                    aria-label={t("task.delete")}
                    className="so-focus-ring inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold text-[var(--so-muted-2)] opacity-0 transition-opacity hover:text-rose-600 focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <TaskDetailDrawer
        open={Boolean(drawerTask)}
        onOpenChange={(next) => {
          if (!next) setDrawerTask(null);
        }}
        kind="personal"
        taskId={drawerTask?.id ?? null}
        seedPersonalTask={drawerTask}
        onChanged={() => void load()}
      />
    </section>
  );
}

function LeadTasksSection({
  scope,
  showAssignee = false,
}: {
  scope: "mine" | "created";
  showAssignee?: boolean;
}) {
  const t = useTranslations("salesOperation");
  const { error: toastError } = useToast();
  const [tasks, setTasks] = useState<SalesTaskWithLead[]>([]);
  const [statusFilter, setStatusFilter] = useState<"open" | "done" | "all">("open");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drawerTaskId, setDrawerTaskId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/sales-operation/tasks?scope=${scope}&status=${statusFilter}`,
        { cache: "no-store" },
      );
      const data = (await res.json()) as {
        ok?: boolean;
        tasks?: SalesTaskWithLead[];
        error?: string;
      };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed to load tasks.");
      setTasks(data.tasks ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tasks.");
    } finally {
      setLoading(false);
    }
  }, [scope, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = useMemo(() => {
    const map = new Map<TaskDueBucket, SalesTaskWithLead[]>();
    for (const task of sortTasks(tasks)) {
      const bucket = taskDueBucket(task);
      const list = map.get(bucket) ?? [];
      list.push(task);
      map.set(bucket, list);
    }
    return map;
  }, [tasks]);

  const completeTask = async (task: SalesTaskWithLead) => {
    const nextStatus: SalesTaskWithLead["status"] = task.status === "done" ? "open" : "done";
    const snapshot = tasks;
    setTasks((prev) =>
      prev
        .map((item) => (item.id === task.id ? { ...item, status: nextStatus } : item))
        .filter((item) => {
          if (statusFilter === "all") return true;
          return statusFilter === "done" ? item.status === "done" : item.status === "open";
        }),
    );
    try {
      const res = await fetch(`/api/sales-operation/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed to update task.");
    } catch (err) {
      setTasks(snapshot);
      toastError(err instanceof Error ? err.message : "Failed to update task.");
    }
  };

  const openCount = tasks.filter((task) => task.status === "open").length;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusFilter value={statusFilter} onChange={setStatusFilter} t={t} />
        <span className="text-xs text-[var(--so-muted)]">
          {t("tasks.openCount", { count: openCount })}
        </span>
      </div>

      {loading ? (
        <TaskListSkeleton />
      ) : error ? (
        <p className="text-sm text-rose-600">{error}</p>
      ) : tasks.length === 0 ? (
        <Card>
          <EmptyState icon={<Inbox className="h-5 w-5" />} title={t("tasks.empty")} />
        </Card>
      ) : (
        <div className="space-y-5">
          {BUCKET_ORDER.filter((bucket) => (grouped.get(bucket) ?? []).length > 0).map((bucket) => (
            <section key={bucket}>
              <h2
                className={cn(
                  "mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide",
                  bucketTone[bucket],
                )}
              >
                {t(`tasks.bucket.${bucket}`)}
                <span className="rounded-full bg-[var(--so-surface-2)] px-1.5 text-[var(--so-muted)]">
                  {(grouped.get(bucket) ?? []).length}
                </span>
              </h2>
              <div className="space-y-2">
                {(grouped.get(bucket) ?? []).map((task) => {
                  const done = task.status === "done";
                  return (
                    <article
                      key={task.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setDrawerTaskId(task.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setDrawerTaskId(task.id);
                        }
                      }}
                      className="flex cursor-pointer items-start gap-3 rounded-[14px] border border-[var(--so-border)] bg-[var(--so-surface)] px-4 py-3 shadow-[var(--so-shadow-xs)] transition-colors hover:border-[var(--so-border-strong)]"
                    >
                      <div
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        <Checkbox checked={done} onChange={() => void completeTask(task)} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            "text-sm font-semibold",
                            done
                              ? "text-[var(--so-muted-2)] line-through"
                              : "text-[var(--so-text)]",
                          )}
                        >
                          {task.title}
                          {task.priority === "high" && !done ? (
                            <span className="ml-2 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">
                              {t("task.priority.high")}
                            </span>
                          ) : null}
                        </p>
                        <p className="mt-0.5 text-xs text-[var(--so-muted)]">
                          {task.leadCompanyName || task.leadName || t("tasks.noLead")}
                          {task.taskType ? ` · ${t(`task.type.${task.taskType}`)}` : ""}
                          {showAssignee && task.assignedToName
                            ? ` · ${task.assignedToName}`
                            : !showAssignee && task.assignedToName
                              ? ` · ${task.assignedToName}`
                              : ""}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        {task.dueAt ? (
                          <p className={cn("text-xs font-medium", bucketTone[bucket])}>
                            {formatSalesDateTime(task.dueAt)}
                          </p>
                        ) : (
                          <p className="text-xs text-[var(--so-muted-2)]">{t("task.noDue")}</p>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      <TaskDetailDrawer
        open={Boolean(drawerTaskId)}
        onOpenChange={(next) => {
          if (!next) setDrawerTaskId(null);
        }}
        kind="lead"
        taskId={drawerTaskId}
        onChanged={() => void load()}
      />
    </section>
  );
}

function PersonalNotesSection() {
  const t = useTranslations("salesOperation");
  const { success: toastSuccess, error: toastError } = useToast();
  const confirm = useConfirm();
  const [notes, setNotes] = useState<PersonalNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [expanded, setExpanded] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/sales-operation/personal/notes", { cache: "no-store" });
      const data = (await res.json()) as { ok?: boolean; notes?: PersonalNote[]; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed to load notes.");
      setNotes(data.notes ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load notes.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const createNote = async () => {
    if (!body.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/sales-operation/personal/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim() || null, body: body.trim() }),
      });
      const data = (await res.json()) as { ok?: boolean; note?: PersonalNote; error?: string };
      if (!res.ok || !data.ok || !data.note) throw new Error(data.error ?? "Failed to create note.");
      setNotes((prev) => [data.note!, ...prev]);
      setTitle("");
      setBody("");
      setExpanded(false);
      toastSuccess(t("mySpace.notes.created"));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create note.";
      setError(message);
      toastError(message);
    } finally {
      setSaving(false);
    }
  };

  const togglePin = async (note: PersonalNote) => {
    const nextPinned = !note.pinned;
    const snapshot = notes;
    setNotes((prev) => {
      const next = prev.map((item) =>
        item.id === note.id ? { ...item, pinned: nextPinned } : item,
      );
      return next.sort((a, b) => Number(b.pinned) - Number(a.pinned));
    });
    try {
      const res = await fetch(`/api/sales-operation/personal/notes/${note.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned: nextPinned }),
      });
      const data = (await res.json()) as { ok?: boolean; note?: PersonalNote; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed to update note.");
      if (data.note) {
        setNotes((prev) => {
          const next = prev.map((item) => (item.id === data.note!.id ? data.note! : item));
          return next.sort((a, b) => Number(b.pinned) - Number(a.pinned));
        });
      }
    } catch (err) {
      setNotes(snapshot);
      toastError(err instanceof Error ? err.message : "Failed to update note.");
    }
  };

  const deleteNote = async (note: PersonalNote) => {
    const ok = await confirm({
      title: t("mySpace.notes.deleteConfirm"),
      confirmLabel: t("task.delete"),
      destructive: true,
    });
    if (!ok) return;
    const snapshot = notes;
    setNotes((prev) => prev.filter((item) => item.id !== note.id));
    try {
      const res = await fetch(`/api/sales-operation/personal/notes/${note.id}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed to delete note.");
      toastSuccess(t("mySpace.notes.deleted"));
    } catch (err) {
      setNotes(snapshot);
      toastError(err instanceof Error ? err.message : "Failed to delete note.");
    }
  };

  const cancelForm = () => {
    setExpanded(false);
    setTitle("");
    setBody("");
  };

  return (
    <section className="space-y-4">
      {expanded ? (
        <Card padded>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[0.95rem] font-bold tracking-tight text-[var(--so-text)]">
              {t("mySpace.notes.newTitle")}
            </h2>
            <button
              type="button"
              onClick={cancelForm}
              aria-label={t("cancel")}
              className="so-focus-ring inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--so-muted-2)] transition-colors hover:bg-[var(--so-surface-hover)] hover:text-[var(--so-text)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <input
            value={title}
            autoFocus
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t("mySpace.notes.titlePlaceholder")}
            className="crm-input mb-2.5 h-9 w-full px-3 text-sm"
          />
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder={t("mySpace.notes.bodyPlaceholder")}
            rows={4}
            className="crm-input w-full resize-y px-3 py-2 text-sm"
          />
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="ghost" onClick={cancelForm}>
              {t("cancel")}
            </Button>
            <Button
              leftIcon={<Plus className="h-4 w-4" />}
              loading={saving}
              disabled={saving || !body.trim()}
              onClick={() => void createNote()}
            >
              {t("mySpace.notes.add")}
            </Button>
          </div>
        </Card>
      ) : (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="so-focus-ring group flex w-full items-center gap-2.5 rounded-[14px] border border-dashed border-[var(--so-border-strong)] bg-[var(--so-surface)] px-4 py-3 text-sm font-semibold text-[var(--so-muted)] transition-colors hover:border-[var(--so-accent)] hover:bg-[var(--so-accent-soft)] hover:text-[var(--so-accent-strong)]"
        >
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--so-accent)] text-white transition-transform group-hover:scale-105">
            <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
          </span>
          {t("mySpace.notes.newTitle")}
        </button>
      )}

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-[16px] border border-[var(--so-border)] bg-[var(--so-surface)] p-4"
            >
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="mt-3 h-3 w-full" />
              <Skeleton className="mt-2 h-3 w-2/3" />
            </div>
          ))}
        </div>
      ) : notes.length === 0 ? (
        <Card>
          <EmptyState icon={<StickyNote className="h-5 w-5" />} title={t("mySpace.notes.empty")} />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {notes.map((note) => (
            <article
              key={note.id}
              className={cn(
                "group rounded-[16px] border bg-[var(--so-surface)] px-4 py-3 shadow-[var(--so-shadow-xs)] transition-colors",
                note.pinned
                  ? "border-amber-300 bg-amber-50/40"
                  : "border-[var(--so-border)] hover:border-[var(--so-border-strong)]",
              )}
            >
              <div className="mb-1 flex items-start justify-between gap-2">
                {note.title ? (
                  <h3 className="text-sm font-semibold text-[var(--so-text)]">{note.title}</h3>
                ) : (
                  <span />
                )}
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => void togglePin(note)}
                    aria-label={note.pinned ? t("mySpace.notes.unpin") : t("mySpace.notes.pin")}
                    className={cn(
                      "so-focus-ring inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors",
                      note.pinned
                        ? "text-amber-600 hover:bg-amber-100"
                        : "text-[var(--so-muted-2)] hover:bg-[var(--so-surface-hover)] hover:text-[var(--so-text)]",
                    )}
                  >
                    {note.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteNote(note)}
                    aria-label={t("task.delete")}
                    className="so-focus-ring inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--so-muted-2)] opacity-0 transition-opacity hover:bg-rose-50 hover:text-rose-600 focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <p className="whitespace-pre-wrap text-sm text-[var(--so-text)]">{note.body}</p>
              <p className="mt-2 text-[11px] text-[var(--so-muted-2)]">
                {formatSalesDateTime(note.updatedAt)}
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
