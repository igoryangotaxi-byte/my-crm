"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/components/auth/AuthProvider";
import { formatSalesDateTime } from "@/lib/sales-operation/display";
import { sortTasks, taskDueBucket } from "@/lib/sales-operation/task-utils";
import {
  SALES_TASK_PRIORITIES,
  SALES_TASK_TYPES,
  type CreateSalesTaskInput,
  type SalesTask,
  type SalesTaskPriority,
  type SalesTaskType,
} from "@/lib/sales-operation/types";

type TaskDraft = {
  title: string;
  description: string;
  taskType: "" | SalesTaskType;
  priority: SalesTaskPriority;
  dueAt: string;
  assignedToUserId: string;
};

const emptyDraft: TaskDraft = {
  title: "",
  description: "",
  taskType: "",
  priority: "normal",
  dueAt: "",
  assignedToUserId: "",
};

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

export function SalesLeadTasksSection({
  leadId,
  onTasksChanged,
}: {
  leadId: string;
  onTasksChanged?: () => void;
}) {
  const t = useTranslations("salesOperation");
  const { users } = useAuth();
  const [tasks, setTasks] = useState<SalesTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TaskDraft>(emptyDraft);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/sales-operation/leads/${leadId}/tasks`, { cache: "no-store" });
      const data = (await res.json()) as { ok?: boolean; tasks?: SalesTask[]; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed to load tasks.");
      setTasks(data.tasks ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tasks.");
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    setShowForm(false);
    setEditingId(null);
    setDraft(emptyDraft);
    void load();
  }, [load]);

  const openTasks = tasks.filter((task) => task.status === "open");
  const hasNextStep = openTasks.length > 0;

  const startAdd = () => {
    setEditingId(null);
    setDraft(emptyDraft);
    setShowForm(true);
    setError(null);
  };

  const startEdit = (task: SalesTask) => {
    setEditingId(task.id);
    setDraft({
      title: task.title,
      description: task.description ?? "",
      taskType: task.taskType ?? "",
      priority: task.priority,
      dueAt: toLocalInput(task.dueAt),
      assignedToUserId: task.assignedToUserId ?? "",
    });
    setShowForm(true);
    setError(null);
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setDraft(emptyDraft);
  };

  const submit = async () => {
    if (!draft.title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const assignedUser = users.find((u) => u.id === draft.assignedToUserId);
      const payload: CreateSalesTaskInput = {
        title: draft.title.trim(),
        description: draft.description.trim() || null,
        taskType: draft.taskType || null,
        priority: draft.priority,
        dueAt: draft.dueAt ? new Date(draft.dueAt).toISOString() : null,
        assignedToUserId: draft.assignedToUserId || null,
        assignedToName: assignedUser?.name ?? null,
      };
      const url = editingId
        ? `/api/sales-operation/leads/${leadId}/tasks/${editingId}`
        : `/api/sales-operation/leads/${leadId}/tasks`;
      const res = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed to save task.");
      cancelForm();
      await load();
      onTasksChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save task.");
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (task: SalesTask, status: "open" | "done") => {
    try {
      const res = await fetch(`/api/sales-operation/leads/${leadId}/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed to update task.");
      await load();
      onTasksChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update task.");
    }
  };

  const remove = async (task: SalesTask) => {
    if (!window.confirm(t("task.deleteConfirm"))) return;
    try {
      const res = await fetch(`/api/sales-operation/leads/${leadId}/tasks/${task.id}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed to delete task.");
      await load();
      onTasksChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete task.");
    }
  };

  const bucketTone: Record<string, string> = {
    overdue: "text-rose-700",
    today: "text-amber-700",
    upcoming: "text-slate-600",
    no_due: "text-slate-400",
    done: "text-slate-400",
  };

  return (
    <div className="rounded-2xl border border-border bg-white/70 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900">{t("task.title")}</p>
        {loading ? (
          <span className="text-xs text-muted">{t("loading")}</span>
        ) : (
          <button
            type="button"
            onClick={startAdd}
            className="rounded-lg border border-border px-2 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            {t("task.add")}
          </button>
        )}
      </div>

      {!hasNextStep && !loading ? (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
          <p className="text-xs font-medium text-amber-800">{t("task.noNextStep")}</p>
          <button
            type="button"
            onClick={startAdd}
            className="shrink-0 rounded-lg bg-amber-600 px-2 py-1 text-[11px] font-semibold text-white transition hover:bg-amber-700"
          >
            {t("task.scheduleNext")}
          </button>
        </div>
      ) : null}

      <div className="space-y-2">
        {tasks.length === 0 && !loading ? (
          <p className="text-xs text-muted">{t("task.empty")}</p>
        ) : (
          sortTasks(tasks).map((task) => {
            const bucket = taskDueBucket(task);
            const done = task.status === "done";
            return (
              <article
                key={task.id}
                className={`rounded-xl border border-slate-200/80 px-3 py-2 ${
                  done ? "bg-slate-50/60" : "bg-slate-50"
                }`}
              >
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={done}
                    onChange={() => void setStatus(task, done ? "open" : "done")}
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className={`truncate text-sm font-medium ${
                        done ? "text-slate-400 line-through" : "text-slate-900"
                      }`}
                    >
                      {task.title}
                      {task.priority === "high" && !done ? (
                        <span className="ml-1 rounded bg-rose-100 px-1 text-[10px] font-semibold text-rose-700">
                          !
                        </span>
                      ) : null}
                    </p>
                    <p className="text-[11px] text-muted">
                      {task.taskType ? `${t(`task.type.${task.taskType}`)} · ` : ""}
                      {task.dueAt ? (
                        <span className={bucketTone[bucket]}>{formatSalesDateTime(task.dueAt)}</span>
                      ) : (
                        <span className="text-slate-400">{t("task.noDue")}</span>
                      )}
                      {task.assignedToName ? ` · ${task.assignedToName}` : ""}
                    </p>
                    {task.description ? (
                      <p className="mt-0.5 whitespace-pre-wrap text-xs text-slate-600">
                        {task.description}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="mt-1 flex gap-2 pl-6">
                  <button
                    type="button"
                    onClick={() => startEdit(task)}
                    className="text-[11px] font-semibold text-slate-600 hover:underline"
                  >
                    {t("task.edit")}
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(task)}
                    className="text-[11px] font-semibold text-rose-600 hover:underline"
                  >
                    {t("task.delete")}
                  </button>
                </div>
              </article>
            );
          })
        )}
      </div>

      {showForm ? (
        <div className="mt-3 space-y-2 rounded-xl border border-border bg-white p-3">
          <label className="block text-sm">
            <span className="crm-label">{t("task.name")}</span>
            <input
              className="crm-input mt-1 h-9 w-full px-3 text-sm"
              value={draft.title}
              onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="block text-sm">
              <span className="crm-label">{t("task.type.label")}</span>
              <select
                className="crm-input mt-1 h-9 w-full px-3 text-sm"
                value={draft.taskType}
                onChange={(event) =>
                  setDraft((prev) => ({
                    ...prev,
                    taskType: event.target.value as TaskDraft["taskType"],
                  }))
                }
              >
                <option value="">{t("task.type.none")}</option>
                {SALES_TASK_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t(`task.type.${type}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="crm-label">{t("task.priority.label")}</span>
              <select
                className="crm-input mt-1 h-9 w-full px-3 text-sm"
                value={draft.priority}
                onChange={(event) =>
                  setDraft((prev) => ({
                    ...prev,
                    priority: event.target.value as SalesTaskPriority,
                  }))
                }
              >
                {SALES_TASK_PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {t(`task.priority.${priority}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block text-sm">
            <span className="crm-label">{t("task.due")}</span>
            <input
              type="datetime-local"
              className="crm-input mt-1 h-9 w-full px-3 text-sm"
              value={draft.dueAt}
              onChange={(event) => setDraft((prev) => ({ ...prev, dueAt: event.target.value }))}
            />
          </label>

          <label className="block text-sm">
            <span className="crm-label">{t("task.assignee")}</span>
            <select
              className="crm-input mt-1 h-9 w-full px-3 text-sm"
              value={draft.assignedToUserId}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, assignedToUserId: event.target.value }))
              }
            >
              <option value="">{t("task.unassigned")}</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="crm-label">{t("task.description")}</span>
            <textarea
              className="crm-input mt-1 min-h-[56px] w-full px-3 py-2 text-sm"
              value={draft.description}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, description: event.target.value }))
              }
            />
          </label>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              disabled={saving || !draft.title.trim()}
              onClick={() => void submit()}
              className="crm-button-primary rounded-xl px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
            >
              {saving ? t("saving") : t("task.save")}
            </button>
            <button
              type="button"
              onClick={cancelForm}
              className="rounded-xl border border-border px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              {t("cancel")}
            </button>
          </div>
        </div>
      ) : null}

      {error ? <p className="mt-2 text-xs text-rose-700">{error}</p> : null}
    </div>
  );
}
