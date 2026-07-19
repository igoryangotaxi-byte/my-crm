"use client";

import { useTranslations } from "next-intl";
import { formatSalesDateTime } from "@/lib/sales-operation/display";
import type { SalesTaskEvent } from "@/lib/sales-operation/types";

function toneFor(type: string): string {
  if (type === "status_changed") return "bg-sky-500";
  if (type === "reassigned") return "bg-violet-500";
  if (type === "summary_updated") return "bg-emerald-500";
  if (type === "follow_up_created") return "bg-amber-500";
  if (type === "due_changed") return "bg-indigo-400";
  if (type === "comment") return "bg-slate-400";
  return "bg-[var(--so-accent)]";
}

export function TaskTimeline({ events }: { events: SalesTaskEvent[] }) {
  const t = useTranslations("salesOperation.taskHub");

  if (events.length === 0) {
    return <p className="text-xs text-[var(--so-muted)]">{t("timeline.empty")}</p>;
  }

  return (
    <ol className="max-h-64 space-y-2 overflow-y-auto">
      {events.map((event) => (
        <li key={event.id} className="flex gap-2">
          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${toneFor(event.eventType)}`} />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-[var(--so-text)]">
              {t(`timeline.type.${event.eventType}`)}
            </p>
            {event.body ? (
              <p className="mt-0.5 whitespace-pre-wrap text-xs text-[var(--so-muted)]">{event.body}</p>
            ) : null}
            <p className="mt-0.5 text-[10px] text-[var(--so-muted-2)]">
              {event.actorName} · {formatSalesDateTime(event.createdAt)}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
