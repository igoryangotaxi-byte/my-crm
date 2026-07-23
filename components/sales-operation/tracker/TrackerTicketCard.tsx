"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Calendar, CheckSquare, Copy, GitBranch, Trash2 } from "lucide-react";
import { cn } from "@/lib/ui/cn";
import type { TrackerTicket } from "@/lib/sales-operation/tracker-types";

const priorityTone: Record<string, string> = {
  low: "bg-slate-100 text-slate-600",
  normal: "bg-sky-50 text-sky-700",
  high: "bg-amber-50 text-amber-700",
  urgent: "bg-rose-50 text-rose-700",
};

export function TrackerTicketCard({
  ticket,
  onOpen,
  isDragging,
  subtaskCount = 0,
  onCopyLink,
  onDelete,
}: {
  ticket: TrackerTicket;
  onOpen: () => void;
  isDragging?: boolean;
  subtaskCount?: number;
  onCopyLink?: () => void;
  onDelete?: () => void;
}) {
  const t = useTranslations("salesOperation.tracker");
  const due = ticket.dueAt ? new Date(ticket.dueAt) : null;
  const overdue = due ? due.getTime() < Date.now() : false;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: isDragging ? 0.55 : 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96, y: -4 }}
      transition={{ type: "spring", stiffness: 420, damping: 32, mass: 0.6 }}
      whileHover={{ y: -1 }}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        "group relative cursor-grab rounded-[12px] border border-[var(--so-border)] bg-[var(--so-surface)] p-3 text-left shadow-[var(--so-shadow-xs)] transition-[border-color,box-shadow] active:cursor-grabbing",
        isDragging && "shadow-[var(--so-shadow-md)] ring-2 ring-[var(--so-accent)]/25",
        "hover:border-[var(--so-border-strong)] hover:shadow-[var(--so-shadow-sm)]",
      )}
    >
      {(onCopyLink || onDelete) && (
        <div
          className="absolute right-1.5 top-1.5 z-10 hidden gap-0.5 rounded-lg border border-[var(--so-border)] bg-[var(--so-surface)] p-0.5 shadow-[var(--so-shadow-xs)] group-hover:flex"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {onCopyLink ? (
            <button
              type="button"
              title={t("copyLink")}
              className="rounded-md p-1 text-[var(--so-muted)] hover:bg-[var(--so-surface-2)] hover:text-[var(--so-text)]"
              onClick={onCopyLink}
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          ) : null}
          {onDelete ? (
            <button
              type="button"
              title={t("delete")}
              className="rounded-md p-1 text-[var(--so-muted)] hover:bg-rose-50 hover:text-rose-600"
              onClick={onDelete}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      )}

      <div className="mb-2 flex items-start justify-between gap-2 pr-10">
        <p className="text-sm font-semibold leading-snug text-[var(--so-text)]">{ticket.title}</p>
        <span
          className={cn(
            "shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
            priorityTone[ticket.priority] ?? priorityTone.normal,
          )}
        >
          {t(`priority${ticket.priority[0]!.toUpperCase()}${ticket.priority.slice(1)}` as "priorityNormal")}
        </span>
      </div>

      {ticket.labels.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-1">
          {ticket.labels.slice(0, 4).map((label) => (
            <span
              key={label.id}
              className="rounded-md px-1.5 py-0.5 text-[10px] font-medium text-white"
              style={{ backgroundColor: label.color }}
            >
              {label.name}
            </span>
          ))}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <div className="flex -space-x-1.5">
          {ticket.assignees.slice(0, 3).map((a) => (
            <span
              key={a.userId}
              title={a.userName ?? a.userId}
              className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[var(--so-surface)] bg-[var(--so-surface-2)] text-[10px] font-semibold text-[var(--so-muted)]"
            >
              {(a.userName ?? "?").slice(0, 1).toUpperCase()}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2 text-[11px] text-[var(--so-muted)]">
          {subtaskCount > 0 ? (
            <span className="inline-flex items-center gap-0.5">
              <GitBranch className="h-3 w-3" />
              {subtaskCount}
            </span>
          ) : null}
          {(ticket.checklistTotal ?? 0) > 0 ? (
            <span className="inline-flex items-center gap-0.5">
              <CheckSquare className="h-3 w-3" />
              {ticket.checklistDone}/{ticket.checklistTotal}
            </span>
          ) : null}
          {due ? (
            <span
              className={cn(
                "inline-flex items-center gap-0.5",
                overdue && "font-semibold text-rose-600",
              )}
            >
              <Calendar className="h-3 w-3" />
              {due.toLocaleDateString()}
            </span>
          ) : null}
        </div>
      </div>
    </motion.div>
  );
}
