"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ExternalLink, UserPlus, CornerDownRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Dialog";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { formatSalesDateTime } from "@/lib/sales-operation/display";
import {
  SALES_TASK_PRIORITIES,
  SALES_TASK_TYPES,
  type PersonalTask,
  type SalesTask,
  type SalesTaskEvent,
  type SalesTaskPriority,
  type SalesTaskStatus,
  type SalesTaskType,
  type SalesTaskWithLead,
} from "@/lib/sales-operation/types";
import { TaskTimeline } from "@/components/sales-operation/tasks/TaskTimeline";
import { ReassignTaskModal } from "@/components/sales-operation/tasks/ReassignTaskModal";
import { FollowUpTaskModal } from "@/components/sales-operation/tasks/FollowUpTaskModal";

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

type LeadTaskDetail = SalesTaskWithLead & {
  leadCompanyName?: string | null;
  leadName?: string | null;
};

export function TaskDetailDrawer({
  open,
  onOpenChange,
  kind,
  taskId,
  seedPersonalTask,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: "lead" | "personal";
  taskId: string | null;
  /** Personal tasks have no GET-by-id; pass the list row as seed. */
  seedPersonalTask?: PersonalTask | null;
  onChanged?: () => void;
}) {
  const t = useTranslations("salesOperation");
  const th = useTranslations("salesOperation.taskHub");
  const { success: toastSuccess, error: toastError } = useToast();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [leadTask, setLeadTask] = useState<LeadTaskDetail | null>(null);
  const [personalTask, setPersonalTask] = useState<PersonalTask | null>(null);
  const [events, setEvents] = useState<SalesTaskEvent[]>([]);
  const [chain, setChain] = useState<SalesTask[]>([]);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<SalesTaskStatus>("open");
  const [priority, setPriority] = useState<SalesTaskPriority>("normal");
  const [dueAt, setDueAt] = useState("");
  const [taskType, setTaskType] = useState<"" | SalesTaskType>("");
  const [resultSummary, setResultSummary] = useState("");

  const [reassignOpen, setReassignOpen] = useState(false);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const load = useCallback(async () => {
    if (!taskId || !open) return;
    setLoading(true);
    try {
      if (kind === "lead") {
        const res = await fetch(`/api/sales-operation/tasks/${taskId}`, { cache: "no-store" });
        const data = (await res.json()) as {
          ok?: boolean;
          task?: LeadTaskDetail;
          events?: SalesTaskEvent[];
          chain?: SalesTask[];
          error?: string;
        };
        if (!res.ok || !data.ok || !data.task) throw new Error(data.error ?? "Failed to load task.");
        setLeadTask(data.task);
        setEvents(data.events ?? []);
        setChain(data.chain ?? []);
        setTitle(data.task.title);
        setDescription(data.task.description ?? "");
        setStatus(data.task.status);
        setPriority(data.task.priority);
        setDueAt(toLocalInput(data.task.dueAt));
        setTaskType(data.task.taskType ?? "");
        setResultSummary(data.task.resultSummary ?? "");
        setPersonalTask(null);
      } else {
        const task = seedPersonalTask?.id === taskId ? seedPersonalTask : null;
        if (!task) throw new Error("Task not found.");
        setPersonalTask(task);
        setLeadTask(null);
        setEvents([]);
        setChain([]);
        setTitle(task.title);
        setDescription(task.description ?? "");
        setStatus(task.status === "done" ? "done" : "open");
        setPriority(task.priority);
        setDueAt(toLocalInput(task.dueAt));
        setTaskType("");
        setResultSummary("");
      }
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to load task.");
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  }, [kind, onOpenChange, open, seedPersonalTask, taskId, toastError]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!taskId) return;
    setSaving(true);
    try {
      if (kind === "lead") {
        const res = await fetch(`/api/sales-operation/tasks/${taskId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            description: description.trim() || null,
            status,
            priority,
            dueAt: dueAt ? new Date(dueAt).toISOString() : null,
            taskType: taskType || null,
            resultSummary: resultSummary.trim() || null,
          }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          task?: LeadTaskDetail;
          events?: SalesTaskEvent[];
          error?: string;
        };
        if (!res.ok || !data.ok || !data.task) throw new Error(data.error ?? "Failed to save.");
        setLeadTask(data.task);
        setEvents(data.events ?? []);
      } else {
        const res = await fetch(`/api/sales-operation/personal/tasks/${taskId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            description: description.trim() || null,
            status: status === "done" ? "done" : "open",
            priority,
            dueAt: dueAt ? new Date(dueAt).toISOString() : null,
          }),
        });
        const data = (await res.json()) as { ok?: boolean; task?: PersonalTask; error?: string };
        if (!res.ok || !data.ok || !data.task) throw new Error(data.error ?? "Failed to save.");
        setPersonalTask(data.task);
      }
      toastSuccess(th("saved"));
      onChanged?.();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  const leadLabel =
    leadTask?.leadCompanyName || leadTask?.leadName || leadTask?.leadId
      ? leadTask.leadCompanyName || leadTask.leadName || th("linkedLead")
      : null;

  return (
    <>
      <Drawer
        open={open}
        onOpenChange={onOpenChange}
        title={loading ? th("loading") : title || th("title")}
        description={
          kind === "lead" && leadTask
            ? [
                leadTask.assignedToName ? `${th("assignee")}: ${leadTask.assignedToName}` : null,
                leadTask.dueAt ? formatSalesDateTime(leadTask.dueAt) : null,
              ]
                .filter(Boolean)
                .join(" · ") || undefined
            : undefined
        }
        width="32rem"
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              {kind === "lead" ? (
                <>
                  <Button
                    variant="secondary"
                    leftIcon={<UserPlus className="h-4 w-4" />}
                    onClick={() => setReassignOpen(true)}
                  >
                    {th("reassign.action")}
                  </Button>
                  <Button
                    variant="secondary"
                    leftIcon={<CornerDownRight className="h-4 w-4" />}
                    onClick={() => setFollowUpOpen(true)}
                  >
                    {th("followUp.action")}
                  </Button>
                </>
              ) : null}
            </div>
            <Button loading={saving} disabled={saving || !title.trim()} onClick={() => void save()}>
              {t("task.save")}
            </Button>
          </div>
        }
      >
        <div className="space-y-4 px-5 py-4">
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : (
            <>
              {kind === "lead" && leadTask?.leadId ? (
                <Link
                  href={`/sales-operation/pipeline?lead=${leadTask.leadId}`}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--so-accent-strong)] hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  {leadLabel}
                </Link>
              ) : null}

              <label className="block text-sm">
                <span className="crm-label">{t("task.name")}</span>
                <input
                  className="crm-input mt-1 h-10 w-full px-3 text-sm"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>

              <div className="grid grid-cols-2 gap-2">
                <label className="block text-sm">
                  <span className="crm-label">{th("status")}</span>
                  <select
                    className="crm-input mt-1 h-10 w-full px-3 text-sm"
                    value={status}
                    onChange={(e) => setStatus(e.target.value as SalesTaskStatus)}
                  >
                    <option value="open">{t("tasks.status.open")}</option>
                    <option value="done">{t("tasks.status.done")}</option>
                    {kind === "lead" ? (
                      <option value="cancelled">{th("statusCancelled")}</option>
                    ) : null}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="crm-label">{t("task.priority.label")}</span>
                  <select
                    className="crm-input mt-1 h-10 w-full px-3 text-sm"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as SalesTaskPriority)}
                  >
                    {SALES_TASK_PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {t(`task.priority.${p}`)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="block text-sm">
                <span className="crm-label">{t("task.due")}</span>
                <input
                  type="datetime-local"
                  className="crm-input mt-1 h-10 w-full px-3 text-sm"
                  value={dueAt}
                  onChange={(e) => setDueAt(e.target.value)}
                />
              </label>

              {kind === "lead" ? (
                <label className="block text-sm">
                  <span className="crm-label">{t("task.type.label")}</span>
                  <select
                    className="crm-input mt-1 h-10 w-full px-3 text-sm"
                    value={taskType}
                    onChange={(e) => setTaskType(e.target.value as "" | SalesTaskType)}
                  >
                    <option value="">{t("task.type.none")}</option>
                    {SALES_TASK_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {t(`task.type.${type}`)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <label className="block text-sm">
                <span className="crm-label">{t("task.description")}</span>
                <textarea
                  className="crm-input mt-1 min-h-[72px] w-full px-3 py-2 text-sm"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>

              {kind === "lead" ? (
                <>
                  <label className="block text-sm">
                    <span className="crm-label">{th("summary")}</span>
                    <textarea
                      className="crm-input mt-1 min-h-[88px] w-full px-3 py-2 text-sm"
                      value={resultSummary}
                      onChange={(e) => setResultSummary(e.target.value)}
                      placeholder={th("summaryPlaceholder")}
                    />
                  </label>

                  {chain.length > 1 ? (
                    <div>
                      <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-[var(--so-muted)]">
                        {th("followUp.chain")}
                      </h3>
                      <ul className="space-y-1">
                        {chain.map((item) => (
                          <li
                            key={item.id}
                            className={`rounded-[10px] border px-2.5 py-1.5 text-xs ${
                              item.id === taskId
                                ? "border-[var(--so-accent)] bg-[var(--so-accent-soft)] font-semibold"
                                : "border-[var(--so-border)] text-[var(--so-muted)]"
                            }`}
                          >
                            {item.title}
                            {item.status === "done" ? ` · ${t("tasks.status.done")}` : ""}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <div>
                    <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-[var(--so-muted)]">
                      {th("timeline.title")}
                    </h3>
                    <TaskTimeline events={events} />
                  </div>
                </>
              ) : null}

              {kind === "personal" && personalTask ? (
                <p className="text-xs text-[var(--so-muted-2)]">
                  {formatSalesDateTime(personalTask.updatedAt)}
                </p>
              ) : null}
            </>
          )}
        </div>
      </Drawer>

      {kind === "lead" && leadTask ? (
        <>
          <ReassignTaskModal
            open={reassignOpen}
            onOpenChange={setReassignOpen}
            currentDueAt={leadTask.dueAt}
            loading={actionLoading}
            onSubmit={async (input) => {
              setActionLoading(true);
              try {
                const res = await fetch(`/api/sales-operation/tasks/${leadTask.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ reassign: true, ...input }),
                });
                const data = (await res.json()) as {
                  ok?: boolean;
                  task?: LeadTaskDetail;
                  events?: SalesTaskEvent[];
                  error?: string;
                };
                if (!res.ok || !data.ok || !data.task) {
                  throw new Error(data.error ?? "Failed to reassign.");
                }
                setLeadTask(data.task);
                setEvents(data.events ?? []);
                setReassignOpen(false);
                toastSuccess(th("reassign.done"));
                onChanged?.();
              } catch (err) {
                toastError(err instanceof Error ? err.message : "Failed to reassign.");
              } finally {
                setActionLoading(false);
              }
            }}
          />
          <FollowUpTaskModal
            open={followUpOpen}
            onOpenChange={setFollowUpOpen}
            defaultTitle={th("followUp.defaultTitle")}
            loading={actionLoading}
            onSubmit={async (input) => {
              setActionLoading(true);
              try {
                const res = await fetch(`/api/sales-operation/tasks/${leadTask.id}/follow-up`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(input),
                });
                const data = (await res.json()) as { ok?: boolean; error?: string };
                if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed to create follow-up.");
                setFollowUpOpen(false);
                toastSuccess(th("followUp.done"));
                await load();
                onChanged?.();
              } catch (err) {
                toastError(err instanceof Error ? err.message : "Failed to create follow-up.");
              } finally {
                setActionLoading(false);
              }
            }}
          />
        </>
      ) : null}
    </>
  );
}
