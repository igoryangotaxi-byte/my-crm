"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { formatSalesDateTime, SALES_STATUS_COLUMNS } from "@/lib/sales-operation/display";
import type { SalesActivity } from "@/lib/sales-operation/types";

const STATUS_LABELS: Record<string, string> = Object.fromEntries(
  SALES_STATUS_COLUMNS.map((column) => [column.status, column.label]),
);

function ActivityDot({ type }: { type: string }) {
  const tone =
    type === "status_changed"
      ? "bg-sky-500"
      : type === "task_completed"
        ? "bg-emerald-500"
        : type === "task_created"
          ? "bg-amber-500"
          : type === "note"
            ? "bg-slate-400"
            : type === "field_changed"
              ? "bg-indigo-400"
              : "bg-violet-500";
  return <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${tone}`} />;
}

export function SalesLeadActivityFeed({
  leadId,
  refreshKey = 0,
  stageLabels,
}: {
  leadId: string;
  refreshKey?: number;
  stageLabels?: Record<string, string>;
}) {
  const t = useTranslations("salesOperation");
  const [activities, setActivities] = useState<SalesActivity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/sales-operation/leads/${leadId}/activity`, {
        cache: "no-store",
      });
      const data = (await res.json()) as {
        ok?: boolean;
        activities?: SalesActivity[];
        error?: string;
      };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed to load activity.");
      setActivities(data.activities ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load activity.");
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const describe = (activity: SalesActivity): string => {
    switch (activity.type) {
      case "status_changed": {
        const from = activity.meta.fromStatus as string | null;
        const to = activity.meta.toStatus as string | null;
        const toLabel = to ? stageLabels?.[to] ?? STATUS_LABELS[to] ?? to : "";
        if (from) {
          const fromLabel = stageLabels?.[from] ?? STATUS_LABELS[from] ?? from;
          return t("activity.statusChanged", { from: fromLabel, to: toLabel });
        }
        return t("activity.statusCreated", { to: toLabel });
      }
      case "task_created":
        return t("activity.taskCreated", { title: activity.title ?? "" });
      case "task_completed":
        return t("activity.taskCompleted", { title: activity.title ?? "" });
      case "note":
        return activity.body ?? t("activity.note");
      case "field_changed": {
        const action = activity.meta.action as string | undefined;
        if (action === "archived") return t("activity.archived");
        if (action === "unarchived") return t("activity.unarchived");
        return t("activity.fieldChanged", { fields: activity.title ?? "" });
      }
      default:
        return activity.title || activity.body || t(`activity.type.${activity.type}`);
    }
  };

  return (
    <div className="so-card p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-[var(--so-text)]">{t("activity.title")}</p>
        {loading ? <span className="text-xs text-muted">{t("loading")}</span> : null}
      </div>

      {activities.length === 0 && !loading ? (
        <p className="text-xs text-muted">{t("activity.empty")}</p>
      ) : (
        <ol className="max-h-64 space-y-2 overflow-y-auto">
          {activities.map((activity) => (
            <li key={activity.id} className="flex gap-2">
              <ActivityDot type={activity.type} />
              <div className="min-w-0 flex-1">
                <p className="whitespace-pre-wrap text-xs text-[var(--so-text)]">{describe(activity)}</p>
                <p className="text-[10px] text-muted">
                  {activity.actorName ?? "System"} · {formatSalesDateTime(activity.occurredAt)}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}

      {error ? <p className="mt-2 text-xs text-rose-700">{error}</p> : null}
    </div>
  );
}
