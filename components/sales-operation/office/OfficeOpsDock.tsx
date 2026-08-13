"use client";

import Link from "next/link";
import {
  CheckCircle2,
  ExternalLink,
  UserPlus,
  ArrowRight,
  Bell,
  Calendar,
  AlertTriangle,
  X,
} from "lucide-react";
import type {
  OfficeAttentionItem,
  OfficeCrmSnapshot,
  OfficeDockTab,
  OfficeManagerAvatar,
  OfficePipelineFilter,
  OfficePipelineSticker,
} from "@/lib/sales-operation/office/types";
import { NEXT_PIPELINE_STATUS, filterStickers } from "@/lib/sales-operation/office/types";
import type { SalesLeadStatus } from "@/lib/sales-operation/types";

type OfficeOpsDockProps = {
  snapshot: OfficeCrmSnapshot | null;
  tab: OfficeDockTab;
  currentUserId?: string | null;
  selectedManagerId?: string | null;
  pipelineFilter: OfficePipelineFilter;
  busy?: boolean;
  askValue: string;
  askBusy?: boolean;
  askReply?: string | null;
  onTabChange: (tab: OfficeDockTab) => void;
  onAskChange: (value: string) => void;
  onAskSubmit: () => void;
  onSelectManager: (managerId: string | null) => void;
  onSetFilter: (filter: OfficePipelineFilter) => void;
  onOpenLead: (leadId: string) => void;
  onAdvanceLead: (leadId: string, toStatus: SalesLeadStatus) => void;
  onCompleteTask: (taskId: string) => void;
  onAssignMe: (leadId: string) => void;
  onMarkNotificationRead: (id: string) => void;
  onOpenClassic: (path: string) => void;
  onClose: () => void;
};

export function OfficeOpsDock({
  snapshot,
  tab,
  currentUserId,
  selectedManagerId,
  pipelineFilter,
  busy,
  askValue,
  askBusy,
  askReply,
  onTabChange,
  onAskChange,
  onAskSubmit,
  onSelectManager,
  onSetFilter,
  onOpenLead,
  onAdvanceLead,
  onCompleteTask,
  onAssignMe,
  onMarkNotificationRead,
  onOpenClassic,
  onClose,
}: OfficeOpsDockProps) {
  const reception = snapshot?.reception;
  const attention = snapshot?.attention ?? [];
  const managers = snapshot?.managers ?? [];

  const myBase = filterStickers(
    snapshot?.stickers ?? [],
    { kind: "mine" },
    currentUserId,
  );
  const myStickers =
    pipelineFilter.kind === "mine" || pipelineFilter.kind === "all"
      ? myBase
      : filterStickers(myBase, pipelineFilter, currentUserId);
  const myTasks = (snapshot?.tasks ?? []).filter(
    (t) => !currentUserId || !t.assignedToUserId || t.assignedToUserId === currentUserId,
  );
  const teamStickers = selectedManagerId
    ? filterStickers(snapshot?.stickers ?? [], {
        kind: "owner",
        ownerUserId: selectedManagerId,
      })
    : [];

  return (
    <div className="absolute bottom-3 left-3 z-30 flex w-[min(440px,94%)] max-h-[min(62vh,560px)] flex-col overflow-hidden rounded-[12px] border border-[var(--so-border)] bg-[var(--so-surface)] shadow-[var(--so-shadow-lg)]">
      <div className="border-b border-[var(--so-border)] px-3 pt-2.5 pb-2">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-bold text-[var(--so-text)]">3D Office</p>
            <p className="text-[11px] text-[var(--so-muted)]">
              What needs attention — then act without leaving
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {reception ? (
              <div className="rounded-lg bg-[var(--so-accent-soft)] px-2 py-1 text-[10px] font-bold text-[var(--so-accent-strong)]">
                {attention.length} items
              </div>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dock"
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--so-border-strong)] text-[var(--so-muted)] hover:bg-[var(--so-surface-hover)] hover:text-[var(--so-text)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <div className="flex gap-1">
          {(
            [
              ["attention", "Attention"],
              ["my_desk", "My Desk"],
              ["team", "Team"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => onTabChange(id)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                tab === id
                  ? "bg-[var(--so-accent)] text-white"
                  : "bg-[var(--so-surface-2)] text-[var(--so-muted)] hover:text-[var(--so-text)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <form
        className="flex gap-1.5 border-b border-[var(--so-border)] px-3 py-2"
        onSubmit={(e) => {
          e.preventDefault();
          onAskSubmit();
        }}
      >
        <input
          value={askValue}
          onChange={(e) => onAskChange(e.target.value)}
          placeholder="Ask Ops: overdue, stuck, my leads…"
          className="h-8 min-w-0 flex-1 rounded-[10px] border border-[var(--so-border-strong)] bg-[var(--so-surface)] px-2.5 text-xs text-[var(--so-text)] outline-none focus:border-[var(--so-accent)]"
        />
        <button
          type="submit"
          disabled={askBusy || !askValue.trim()}
          className="h-8 rounded-[10px] bg-slate-900 px-2.5 text-[11px] font-semibold text-white disabled:opacity-50"
        >
          Go
        </button>
      </form>
      {askReply ? (
        <p className="border-b border-[var(--so-border)] px-3 py-1.5 text-[11px] text-[var(--so-muted)]">
          {askReply}
        </p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2.5 text-xs">
        {tab === "attention" ? (
          <AttentionList
            items={attention}
            busy={busy}
            onOpenLead={onOpenLead}
            onAdvanceLead={onAdvanceLead}
            onCompleteTask={onCompleteTask}
            onAssignMe={onAssignMe}
            onMarkNotificationRead={onMarkNotificationRead}
            onOpenClassic={onOpenClassic}
          />
        ) : null}

        {tab === "my_desk" ? (
          <MyDeskPanel
            stickers={myStickers}
            tasks={myTasks}
            meetings={snapshot?.meetings ?? []}
            busy={busy}
            onOpenLead={onOpenLead}
            onAdvanceLead={onAdvanceLead}
            onCompleteTask={onCompleteTask}
            onOpenClassic={onOpenClassic}
            onSetFilter={onSetFilter}
            pipelineFilter={pipelineFilter}
          />
        ) : null}

        {tab === "team" ? (
          <TeamPanel
            managers={managers}
            selectedManagerId={selectedManagerId}
            stickers={teamStickers}
            busy={busy}
            onSelectManager={onSelectManager}
            onOpenLead={onOpenLead}
            onAdvanceLead={onAdvanceLead}
            onOpenClassic={onOpenClassic}
            onSetFilter={onSetFilter}
          />
        ) : null}
      </div>

      <div className="flex flex-wrap gap-1.5 border-t border-[var(--so-border)] px-3 py-2">
        <Link
          href="/sales-operation/pipeline"
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--so-border-strong)] px-2 py-1 text-[10px] font-semibold text-[var(--so-muted)] hover:text-[var(--so-text)]"
        >
          Full pipeline <ExternalLink className="h-3 w-3" />
        </Link>
        <Link
          href="/sales-operation/tasks"
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--so-border-strong)] px-2 py-1 text-[10px] font-semibold text-[var(--so-muted)] hover:text-[var(--so-text)]"
        >
          My Space <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}

function AttentionList({
  items,
  busy,
  onOpenLead,
  onAdvanceLead,
  onCompleteTask,
  onAssignMe,
  onMarkNotificationRead,
  onOpenClassic,
}: {
  items: OfficeAttentionItem[];
  busy?: boolean;
  onOpenLead: (id: string) => void;
  onAdvanceLead: (id: string, to: SalesLeadStatus) => void;
  onCompleteTask: (id: string) => void;
  onAssignMe: (id: string) => void;
  onMarkNotificationRead: (id: string) => void;
  onOpenClassic: (path: string) => void;
}) {
  if (!items.length) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-4 text-center">
        <p className="text-[12px] font-semibold text-emerald-800">All clear</p>
        <p className="mt-1 text-[11px] text-emerald-700">No overdue, unassigned, or stuck items.</p>
      </div>
    );
  }

  return (
    <ul className="space-y-1.5">
      {items.map((item) => (
        <li
          key={item.id}
          className="rounded-xl border border-[var(--so-border)] bg-[var(--so-surface-2)] px-2.5 py-2"
        >
          <div className="flex items-start gap-2">
            <AttentionIcon kind={item.kind} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12px] font-bold text-[var(--so-text)]">{item.title}</div>
              <div className="truncate text-[10px] text-[var(--so-muted)]">{item.subtitle}</div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {item.kind === "overdue_task" && item.taskId ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onCompleteTask(item.taskId!)}
                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-2 py-1 text-[10px] font-semibold text-white disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-3 w-3" /> Done
                  </button>
                ) : null}
                {item.kind === "unassigned_lead" && item.leadId ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onAssignMe(item.leadId!)}
                    className="inline-flex items-center gap-1 rounded-lg bg-[var(--so-accent)] px-2 py-1 text-[10px] font-semibold text-white disabled:opacity-50"
                  >
                    <UserPlus className="h-3 w-3" /> Assign me
                  </button>
                ) : null}
                {item.kind === "stuck_lead" && item.leadId ? (
                  <AdvanceButton
                    leadId={item.leadId}
                    status={item.leadStatus ?? null}
                    busy={busy}
                    onAdvanceLead={onAdvanceLead}
                  />
                ) : null}
                {item.leadId ? (
                  <button
                    type="button"
                    onClick={() => onOpenLead(item.leadId!)}
                    className="rounded-lg border border-[var(--so-border-strong)] px-2 py-1 text-[10px] font-semibold"
                  >
                    Open
                  </button>
                ) : null}
                {item.kind === "unread_notification" && item.notificationId ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      onMarkNotificationRead(item.notificationId!);
                      if (item.leadId) onOpenLead(item.leadId);
                      else if (item.link) onOpenClassic(item.link);
                    }}
                    className="rounded-lg border border-[var(--so-border-strong)] px-2 py-1 text-[10px] font-semibold"
                  >
                    Open & read
                  </button>
                ) : null}
                {item.kind === "upcoming_meeting" ? (
                  <button
                    type="button"
                    onClick={() => onOpenClassic("/sales-operation/calendar")}
                    className="rounded-lg border border-[var(--so-border-strong)] px-2 py-1 text-[10px] font-semibold"
                  >
                    Calendar
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function AdvanceButton({
  leadId,
  busy,
  onAdvanceLead,
  status,
}: {
  leadId: string;
  busy?: boolean;
  onAdvanceLead: (id: string, to: SalesLeadStatus) => void;
  status?: SalesLeadStatus | null;
}) {
  const next = status ? NEXT_PIPELINE_STATUS[status] : null;
  if (!next) return null;
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => onAdvanceLead(leadId, next)}
      className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2 py-1 text-[10px] font-semibold text-white disabled:opacity-50"
    >
      Advance <ArrowRight className="h-3 w-3" />
    </button>
  );
}

function AttentionIcon({ kind }: { kind: OfficeAttentionItem["kind"] }) {
  if (kind === "overdue_task") return <AlertTriangle className="mt-0.5 h-3.5 w-3.5 text-rose-600" />;
  if (kind === "upcoming_meeting") return <Calendar className="mt-0.5 h-3.5 w-3.5 text-sky-600" />;
  if (kind === "unread_notification") return <Bell className="mt-0.5 h-3.5 w-3.5 text-amber-600" />;
  return <AlertTriangle className="mt-0.5 h-3.5 w-3.5 text-[var(--so-accent)]" />;
}

function MyDeskPanel({
  stickers,
  tasks,
  meetings,
  busy,
  onOpenLead,
  onAdvanceLead,
  onCompleteTask,
  onOpenClassic,
  onSetFilter,
  pipelineFilter,
}: {
  stickers: OfficePipelineSticker[];
  tasks: OfficeCrmSnapshot["tasks"];
  meetings: OfficeCrmSnapshot["meetings"];
  busy?: boolean;
  onOpenLead: (id: string) => void;
  onAdvanceLead: (id: string, to: SalesLeadStatus) => void;
  onCompleteTask: (id: string) => void;
  onOpenClassic: (path: string) => void;
  onSetFilter: (f: OfficePipelineFilter) => void;
  pipelineFilter: OfficePipelineFilter;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1">
        {(
          [
            [{ kind: "mine" as const }, "My leads"],
            [{ kind: "stuck" as const }, "Stuck"],
            [{ kind: "status" as const, status: "new" as const }, "New"],
          ] as const
        ).map(([filter, label]) => {
          const active =
            pipelineFilter.kind === filter.kind &&
            (filter.kind !== "status" ||
              (pipelineFilter.kind === "status" && pipelineFilter.status === filter.status));
          return (
            <button
              key={label}
              type="button"
              onClick={() => onSetFilter(filter)}
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                active
                  ? "bg-[var(--so-accent)] text-white"
                  : "bg-[var(--so-surface)] text-[var(--so-muted)] border border-[var(--so-border)]"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      <section>
        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-[var(--so-muted)]">
          My open leads ({stickers.length})
        </p>
        {!stickers.length ? (
          <p className="text-[var(--so-muted)]">No open leads assigned to you.</p>
        ) : (
          <ul className="space-y-1.5">
            {stickers.slice(0, 12).map((s) => {
              const next = NEXT_PIPELINE_STATUS[s.status];
              return (
                <li
                  key={s.id}
                  className="rounded-xl border border-[var(--so-border)] bg-[var(--so-surface-2)] px-2.5 py-2"
                >
                  <button type="button" onClick={() => onOpenLead(s.id)} className="w-full text-left">
                    <div className="truncate text-[12px] font-bold">{s.title}</div>
                    <div className="text-[10px] text-[var(--so-muted)]">
                      {s.status.replace(/_/g, " ")} · {s.daysInStage}d in stage
                    </div>
                  </button>
                  <div className="mt-1.5 flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => onOpenLead(s.id)}
                      className="rounded-lg border border-[var(--so-border-strong)] px-2 py-1 text-[10px] font-semibold"
                    >
                      Open
                    </button>
                    {next ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onAdvanceLead(s.id, next)}
                        className="rounded-lg bg-slate-900 px-2 py-1 text-[10px] font-semibold text-white disabled:opacity-50"
                      >
                        Advance → {next.replace(/_/g, " ")}
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-[var(--so-muted)]">
          My tasks
        </p>
        {!tasks.length ? (
          <p className="text-[var(--so-muted)]">No open tasks.</p>
        ) : (
          <ul className="space-y-1.5">
            {tasks.slice(0, 8).map((task) => (
              <li
                key={task.id}
                className="flex items-start justify-between gap-2 rounded-xl border border-[var(--so-border)] bg-[var(--so-surface-2)] px-2.5 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-[12px] font-bold">{task.title}</div>
                  <div className="text-[10px] text-[var(--so-muted)]">
                    {task.overdue ? (
                      <span className="font-semibold text-rose-600">Overdue</span>
                    ) : (
                      "Open"
                    )}
                    {task.leadName ? ` · ${task.leadName}` : ""}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onCompleteTask(task.id)}
                  className="rounded-lg p-1 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                >
                  <CheckCircle2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="mb-1.5 flex items-center justify-between">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--so-muted)]">
            Today&apos;s meetings
          </p>
          <button
            type="button"
            onClick={() => onOpenClassic("/sales-operation/calendar")}
            className="text-[10px] font-semibold text-[var(--so-accent-strong)]"
          >
            Open calendar
          </button>
        </div>
        {!meetings.length ? (
          <p className="text-[var(--so-muted)]">No meetings today.</p>
        ) : (
          <ul className="space-y-1">
            {meetings.slice(0, 5).map((m) => (
              <li key={m.id} className="text-[11px] text-[var(--so-text)]">
                <span className="font-semibold">
                  {new Date(m.startsAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>{" "}
                {m.title}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function TeamPanel({
  managers,
  selectedManagerId,
  stickers,
  busy,
  onSelectManager,
  onOpenLead,
  onAdvanceLead,
  onOpenClassic,
  onSetFilter,
}: {
  managers: OfficeManagerAvatar[];
  selectedManagerId?: string | null;
  stickers: OfficePipelineSticker[];
  busy?: boolean;
  onSelectManager: (id: string | null) => void;
  onOpenLead: (id: string) => void;
  onAdvanceLead: (id: string, to: SalesLeadStatus) => void;
  onOpenClassic: (path: string) => void;
  onSetFilter: (f: OfficePipelineFilter) => void;
}) {
  if (!managers.length) {
    return <p className="text-[var(--so-muted)]">No managers with open pipeline leads yet.</p>;
  }

  const selected = managers.find((m) => m.id === selectedManagerId) ?? null;

  return (
    <div className="space-y-3">
      <ul className="space-y-1.5">
        {managers.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              onClick={() => {
                onSelectManager(m.id);
                onSetFilter({ kind: "owner", ownerUserId: m.id });
              }}
              className={`flex w-full items-center justify-between rounded-xl border px-2.5 py-2 text-left ${
                selectedManagerId === m.id
                  ? "border-[var(--so-accent)] bg-[var(--so-accent-soft)]"
                  : "border-[var(--so-border)] bg-[var(--so-surface-2)]"
              }`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: m.color }}
                  />
                  <span className="truncate text-[12px] font-bold text-[var(--so-text)]">
                    {m.name}
                  </span>
                </div>
                <div className="mt-0.5 text-[10px] text-[var(--so-muted)]">{m.label}</div>
              </div>
              <span
                className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                  m.severity === "critical"
                    ? "bg-rose-100 text-rose-700"
                    : m.severity === "warn"
                      ? "bg-amber-100 text-amber-800"
                      : "bg-emerald-100 text-emerald-700"
                }`}
              >
                {m.severity}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {selected ? (
        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--so-muted)]">
              {selected.name}&apos;s deals
            </p>
            <button
              type="button"
              onClick={() => onOpenClassic("/sales-operation/manager-analytics")}
              className="text-[10px] font-semibold text-[var(--so-accent-strong)]"
            >
              Manager analytics
            </button>
          </div>
          {!stickers.length ? (
            <p className="text-[var(--so-muted)]">No open deals for this manager.</p>
          ) : (
            <ul className="space-y-1.5">
              {stickers.slice(0, 10).map((s) => {
                const next = NEXT_PIPELINE_STATUS[s.status];
                return (
                  <li
                    key={s.id}
                    className="rounded-xl border border-[var(--so-border)] bg-[var(--so-surface-2)] px-2.5 py-2"
                  >
                    <div className="truncate text-[12px] font-bold">{s.title}</div>
                    <div className="text-[10px] text-[var(--so-muted)]">
                      {s.status.replace(/_/g, " ")} · {s.daysInStage}d
                    </div>
                    <div className="mt-1.5 flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => onOpenLead(s.id)}
                        className="rounded-lg border border-[var(--so-border-strong)] px-2 py-1 text-[10px] font-semibold"
                      >
                        Open
                      </button>
                      {next ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => onAdvanceLead(s.id, next)}
                          className="rounded-lg bg-slate-900 px-2 py-1 text-[10px] font-semibold text-white disabled:opacity-50"
                        >
                          Advance
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : (
        <p className="text-[11px] text-[var(--so-muted)]">
          Click a manager to see their open deals on the Pipeline Wall.
        </p>
      )}
    </div>
  );
}
