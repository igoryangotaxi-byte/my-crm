"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { formatSalesDateTime } from "@/lib/sales-operation/display";
import { sortTasks, taskDueBucket, type TaskDueBucket } from "@/lib/sales-operation/task-utils";
import type { SalesTaskWithLead } from "@/lib/sales-operation/types";

type Scope = "mine" | "all";
type StatusFilter = "open" | "done" | "all";

const BUCKET_ORDER: TaskDueBucket[] = ["overdue", "today", "upcoming", "no_due", "done"];

export function SalesMyTasksView() {
  const t = useTranslations("salesOperation");
  const [tasks, setTasks] = useState<SalesTaskWithLead[]>([]);
  const [scope, setScope] = useState<Scope>("mine");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    try {
      const res = await fetch(
        `/api/sales-operation/leads/${task.leadId}/tasks/${task.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: task.status === "done" ? "open" : "done" }),
        },
      );
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed to update task.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update task.");
    }
  };

  const bucketTone: Record<TaskDueBucket, string> = {
    overdue: "text-rose-700",
    today: "text-amber-700",
    upcoming: "text-slate-600",
    no_due: "text-slate-500",
    done: "text-slate-400",
  };

  const openCount = tasks.filter((task) => task.status === "open").length;

  return (
    <div className="px-3 pb-8">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-xl border border-border">
          {(["mine", "all"] as Scope[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setScope(value)}
              className={`px-3 py-1.5 text-sm font-semibold transition ${
                scope === value ? "bg-red-600 text-white" : "bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {t(`tasks.scope.${value}`)}
            </button>
          ))}
        </div>
        <div className="inline-flex overflow-hidden rounded-xl border border-border">
          {(["open", "done", "all"] as StatusFilter[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setStatusFilter(value)}
              className={`px-3 py-1.5 text-sm font-semibold transition ${
                statusFilter === value
                  ? "bg-slate-800 text-white"
                  : "bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {t(`tasks.status.${value}`)}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted">{t("tasks.openCount", { count: openCount })}</span>
      </div>

      {loading ? (
        <p className="text-sm text-muted">{t("loading")}</p>
      ) : error ? (
        <p className="text-sm text-rose-700">{error}</p>
      ) : tasks.length === 0 ? (
        <p className="text-sm text-muted">{t("tasks.empty")}</p>
      ) : (
        <div className="space-y-5">
          {BUCKET_ORDER.filter((bucket) => (grouped.get(bucket) ?? []).length > 0).map((bucket) => (
            <section key={bucket}>
              <h2 className={`mb-2 text-xs font-bold uppercase tracking-wide ${bucketTone[bucket]}`}>
                {t(`tasks.bucket.${bucket}`)} · {(grouped.get(bucket) ?? []).length}
              </h2>
              <div className="space-y-2">
                {(grouped.get(bucket) ?? []).map((task) => {
                  const done = task.status === "done";
                  return (
                    <article
                      key={task.id}
                      className="crm-surface flex items-start gap-3 rounded-2xl px-4 py-3"
                    >
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={done}
                        onChange={() => void completeTask(task)}
                      />
                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-sm font-semibold ${
                            done ? "text-slate-400 line-through" : "text-slate-900"
                          }`}
                        >
                          {task.title}
                          {task.priority === "high" && !done ? (
                            <span className="ml-2 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">
                              {t("task.priority.high")}
                            </span>
                          ) : null}
                        </p>
                        <p className="text-xs text-muted">
                          {task.leadCompanyName || task.leadName || t("tasks.noLead")}
                          {task.taskType ? ` · ${t(`task.type.${task.taskType}`)}` : ""}
                          {task.assignedToName ? ` · ${task.assignedToName}` : ""}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        {task.dueAt ? (
                          <p className={`text-xs font-medium ${bucketTone[bucket]}`}>
                            {formatSalesDateTime(task.dueAt)}
                          </p>
                        ) : (
                          <p className="text-xs text-slate-400">{t("task.noDue")}</p>
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
    </div>
  );
}
