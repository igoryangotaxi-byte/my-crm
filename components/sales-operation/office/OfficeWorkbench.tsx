"use client";

import Link from "next/link";
import { CheckCircle2, ExternalLink, X } from "lucide-react";
import type {
  OfficeAgent,
  OfficeWorkbenchMode,
} from "@/lib/sales-operation/office/agents";
import { filterLeadsForWorkbench } from "@/lib/sales-operation/office/agents";
import type { OfficeCrmSnapshot } from "@/lib/sales-operation/office/types";
import type { SalesLeadStatus } from "@/lib/sales-operation/types";

const NEXT_STATUS: Partial<Record<SalesLeadStatus, SalesLeadStatus>> = {
  new: "in_progress",
  in_progress: "proposal_sent",
  proposal_sent: "negotiation",
  negotiation: "signed",
};

type OfficeWorkbenchProps = {
  snapshot: OfficeCrmSnapshot | null;
  mode: OfficeWorkbenchMode;
  agent: OfficeAgent | null;
  busy?: boolean;
  onClose: () => void;
  onOpenLead: (leadId: string) => void;
  onAdvanceLead: (leadId: string, toStatus: SalesLeadStatus) => void;
  onCompleteTask: (taskId: string) => void;
  onRunAction: (action: OfficeAgent["actions"][number]) => void;
  onOpenClassic: (path: string) => void;
};

function modeTitle(mode: OfficeWorkbenchMode, agent: OfficeAgent | null) {
  if (mode.kind === "leads") return mode.title;
  if (mode.kind === "briefing") return agent ? `${agent.name} · Briefing` : "Briefing";
  if (mode.kind === "tasks") return mode.overdueOnly ? "Overdue tasks" : "My tasks";
  if (mode.kind === "meetings") return "Today's meetings";
  if (mode.kind === "analytics") return "Live funnel";
  if (mode.kind === "discovery") return "Lead Discovery";
  if (mode.kind === "notifications") return "Notifications";
  return "Workbench";
}

export function OfficeWorkbench({
  snapshot,
  mode,
  agent,
  busy,
  onClose,
  onOpenLead,
  onAdvanceLead,
  onCompleteTask,
  onRunAction,
  onOpenClassic,
}: OfficeWorkbenchProps) {
  const reception = snapshot?.reception;

  return (
    <div className="absolute bottom-3 left-3 z-30 flex w-[min(420px,94%)] max-h-[min(58vh,520px)] flex-col overflow-hidden rounded-2xl border border-[var(--so-border)] bg-[var(--so-surface)]/97 shadow-2xl backdrop-blur">
      <div className="flex items-start justify-between gap-2 border-b border-[var(--so-border)] px-3 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-[var(--so-text)]">
            {modeTitle(mode, agent)}
          </p>
          {agent ? (
            <p className="text-[11px] font-semibold" style={{ color: agent.color }}>
              {agent.name} · {agent.role}
            </p>
          ) : (
            <p className="text-[11px] text-[var(--so-muted)]">CRM actions in 3D</p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1 text-[var(--so-muted)] hover:bg-[var(--so-surface-hover)]"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {agent ? (
        <div className="flex flex-wrap gap-1 border-b border-[var(--so-border)] px-2.5 py-2">
          {agent.actions.map((action) => {
            const key = "workbench" in action ? JSON.stringify(action.workbench) : action.classic;
            return (
              <button
                key={key}
                type="button"
                disabled={busy}
                onClick={() => onRunAction(action)}
                className="rounded-lg border border-[var(--so-border-strong)] px-2 py-1 text-[10px] font-semibold text-[var(--so-text)] hover:bg-[var(--so-surface-hover)] disabled:opacity-50"
              >
                {action.label}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2.5 text-xs">
        {mode.kind === "briefing" && reception ? (
          <div className="space-y-3">
            <p className="whitespace-pre-line text-[12px] leading-relaxed text-[var(--so-text)]">
              {reception.briefing}
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                ["New leads", reception.newLeads],
                ["Meetings", reception.meetingsToday],
                ["Overdue", reception.overdueTasks],
                ["Unread", reception.unreadNotifications],
              ].map(([label, value]) => (
                <div
                  key={String(label)}
                  className="rounded-xl border border-[var(--so-border)] bg-[var(--so-surface-2)] px-2.5 py-1.5"
                >
                  <div className="text-[10px] font-semibold uppercase text-[var(--so-muted)]">
                    {label}
                  </div>
                  <div className="text-lg font-bold text-[var(--so-text)]">{value}</div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() =>
                  onRunAction({
                    label: "New leads",
                    workbench: { kind: "leads", title: "New leads", status: "new" },
                  })
                }
                className="rounded-[10px] bg-[var(--so-accent)] px-2.5 py-1.5 text-[11px] font-semibold text-white"
              >
                Work new leads
              </button>
              <button
                type="button"
                onClick={() =>
                  onRunAction({
                    label: "Overdue",
                    workbench: { kind: "tasks", overdueOnly: true },
                  })
                }
                className="rounded-[10px] border border-[var(--so-border-strong)] px-2.5 py-1.5 text-[11px] font-semibold"
              >
                Clear overdue
              </button>
            </div>
          </div>
        ) : null}

        {mode.kind === "leads" ? (
          <LeadsPanel
            snapshot={snapshot}
            mode={mode}
            busy={busy}
            onOpenLead={onOpenLead}
            onAdvanceLead={onAdvanceLead}
          />
        ) : null}

        {mode.kind === "tasks" ? (
          <TasksPanel
            snapshot={snapshot}
            overdueOnly={Boolean(mode.overdueOnly)}
            busy={busy}
            onCompleteTask={onCompleteTask}
            onOpenLead={onOpenLead}
          />
        ) : null}

        {mode.kind === "meetings" ? <MeetingsPanel snapshot={snapshot} /> : null}

        {mode.kind === "analytics" ? (
          <AnalyticsPanel snapshot={snapshot} onOpenClassic={onOpenClassic} />
        ) : null}

        {mode.kind === "discovery" ? (
          <DiscoveryPanel snapshot={snapshot} onOpenClassic={onOpenClassic} />
        ) : null}

        {mode.kind === "notifications" ? <NotificationsPanel snapshot={snapshot} /> : null}
      </div>
    </div>
  );
}

function LeadsPanel({
  snapshot,
  mode,
  busy,
  onOpenLead,
  onAdvanceLead,
}: {
  snapshot: OfficeCrmSnapshot | null;
  mode: Extract<OfficeWorkbenchMode, { kind: "leads" }>;
  busy?: boolean;
  onOpenLead: (id: string) => void;
  onAdvanceLead: (id: string, to: SalesLeadStatus) => void;
}) {
  const rows = filterLeadsForWorkbench(snapshot?.stickers ?? [], mode).slice(0, 18);
  if (!rows.length) {
    return <p className="text-[var(--so-muted)]">No matching leads in pipeline.</p>;
  }
  return (
    <ul className="space-y-1.5">
      {rows.map((row) => {
        const next = NEXT_STATUS[row.status];
        return (
          <li
            key={row.id}
            className="rounded-xl border border-[var(--so-border)] bg-[var(--so-surface-2)] px-2.5 py-2"
          >
            <button
              type="button"
              onClick={() => onOpenLead(row.id)}
              className="w-full text-left"
            >
              <div className="truncate text-[12px] font-bold text-[var(--so-text)]">{row.title}</div>
              <div className="truncate text-[10px] text-[var(--so-muted)]">
                {row.company ?? "—"} · {row.status.replace(/_/g, " ")}
                {row.ownerName ? ` · ${row.ownerName}` : ""}
              </div>
            </button>
            <div className="mt-1.5 flex gap-1.5">
              <button
                type="button"
                disabled={busy}
                onClick={() => onOpenLead(row.id)}
                className="rounded-lg border border-[var(--so-border-strong)] px-2 py-1 text-[10px] font-semibold"
              >
                Open card
              </button>
              {next ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onAdvanceLead(row.id, next)}
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
  );
}

function TasksPanel({
  snapshot,
  overdueOnly,
  busy,
  onCompleteTask,
  onOpenLead,
}: {
  snapshot: OfficeCrmSnapshot | null;
  overdueOnly: boolean;
  busy?: boolean;
  onCompleteTask: (id: string) => void;
  onOpenLead: (id: string) => void;
}) {
  const rows = (snapshot?.tasks ?? [])
    .filter((t) => (overdueOnly ? t.overdue : true))
    .slice(0, 20);
  if (!rows.length) {
    return (
      <p className="text-[var(--so-muted)]">
        {overdueOnly ? "No overdue tasks — nice." : "No open tasks."}
      </p>
    );
  }
  return (
    <ul className="space-y-1.5">
      {rows.map((task) => (
        <li
          key={task.id}
          className="rounded-xl border border-[var(--so-border)] bg-[var(--so-surface-2)] px-2.5 py-2"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-[12px] font-bold text-[var(--so-text)]">{task.title}</div>
              <div className="text-[10px] text-[var(--so-muted)]">
                {task.overdue ? (
                  <span className="font-semibold text-rose-600">Overdue</span>
                ) : (
                  "Open"
                )}
                {task.dueAt ? ` · due ${new Date(task.dueAt).toLocaleString()}` : ""}
                {task.leadName ? ` · ${task.leadName}` : ""}
              </div>
            </div>
            <button
              type="button"
              disabled={busy}
              title="Mark done"
              onClick={() => onCompleteTask(task.id)}
              className="rounded-lg p-1 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4" />
            </button>
          </div>
          {task.leadId ? (
            <button
              type="button"
              onClick={() => onOpenLead(task.leadId!)}
              className="mt-1 text-[10px] font-semibold text-[var(--so-accent-strong)]"
            >
              Open related lead
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function MeetingsPanel({ snapshot }: { snapshot: OfficeCrmSnapshot | null }) {
  const rows = snapshot?.meetings ?? [];
  if (!rows.length) {
    return <p className="text-[var(--so-muted)]">No meetings scheduled for today.</p>;
  }
  return (
    <ul className="space-y-1.5">
      {rows.map((m) => (
        <li
          key={m.id}
          className="rounded-xl border border-[var(--so-border)] bg-[var(--so-surface-2)] px-2.5 py-2"
        >
          <div className="text-[12px] font-bold text-[var(--so-text)]">{m.title}</div>
          <div className="text-[10px] text-[var(--so-muted)]">
            {new Date(m.startsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </div>
        </li>
      ))}
    </ul>
  );
}

function AnalyticsPanel({
  snapshot,
  onOpenClassic,
}: {
  snapshot: OfficeCrmSnapshot | null;
  onOpenClassic: (path: string) => void;
}) {
  const a = snapshot?.analytics;
  if (!a) return <p className="text-[var(--so-muted)]">Analytics unavailable.</p>;
  const order = ["new", "in_progress", "proposal_sent", "negotiation", "signed", "rejected"];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1.5">
        <div className="rounded-xl border border-[var(--so-border)] bg-[var(--so-surface-2)] px-2.5 py-2">
          <div className="text-[10px] font-semibold uppercase text-[var(--so-muted)]">Leads</div>
          <div className="text-xl font-bold">{a.leadsTotal}</div>
        </div>
        <div className="rounded-xl border border-[var(--so-border)] bg-[var(--so-surface-2)] px-2.5 py-2">
          <div className="text-[10px] font-semibold uppercase text-[var(--so-muted)]">Win rate</div>
          <div className="text-xl font-bold">{a.signedConversionPct.toFixed(1)}%</div>
        </div>
      </div>
      <ul className="space-y-1">
        {order.map((status) => (
          <li key={status} className="flex items-center justify-between text-[11px]">
            <span className="capitalize text-[var(--so-muted)]">{status.replace(/_/g, " ")}</span>
            <span className="font-bold text-[var(--so-text)]">{a.byStatus[status] ?? 0}</span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => onOpenClassic("/sales-operation/analytics")}
        className="inline-flex items-center gap-1 rounded-[10px] bg-[var(--so-accent)] px-2.5 py-1.5 text-[11px] font-semibold text-white"
      >
        Full analytics <ExternalLink className="h-3 w-3" />
      </button>
    </div>
  );
}

function DiscoveryPanel({
  snapshot,
  onOpenClassic,
}: {
  snapshot: OfficeCrmSnapshot | null;
  onOpenClassic: (path: string) => void;
}) {
  const d = snapshot?.discovery;
  return (
    <div className="space-y-3">
      {!d?.enabled ? (
        <p className="text-[var(--so-muted)]">
          {d?.error ?? "Lead Discovery not available for this account."}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-1.5">
          <div className="rounded-xl border border-[var(--so-border)] bg-[var(--so-surface-2)] px-2.5 py-2">
            <div className="text-[10px] font-semibold uppercase text-[var(--so-muted)]">
              Campaigns
            </div>
            <div className="text-xl font-bold">{d.campaignCount}</div>
          </div>
          <div className="rounded-xl border border-[var(--so-border)] bg-[var(--so-surface-2)] px-2.5 py-2">
            <div className="text-[10px] font-semibold uppercase text-[var(--so-muted)]">Active</div>
            <div className="text-xl font-bold">{d.activeCount}</div>
          </div>
        </div>
      )}
      <p className="text-[11px] text-[var(--so-muted)]">
        New pipeline leads from discovery:{" "}
        <strong className="text-[var(--so-text)]">{snapshot?.reception.newLeads ?? 0}</strong>
      </p>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => onOpenClassic("/sales-operation/lead-discovery")}
          className="inline-flex items-center gap-1 rounded-[10px] bg-[var(--so-accent)] px-2.5 py-1.5 text-[11px] font-semibold text-white"
        >
          Open Discovery <ExternalLink className="h-3 w-3" />
        </button>
        <Link
          href="/sales-operation/automation"
          className="inline-flex items-center rounded-[10px] border border-[var(--so-border-strong)] px-2.5 py-1.5 text-[11px] font-semibold"
        >
          Automations
        </Link>
      </div>
    </div>
  );
}

function NotificationsPanel({ snapshot }: { snapshot: OfficeCrmSnapshot | null }) {
  const rows = (snapshot?.notifications ?? []).slice(0, 20);
  if (!rows.length) return <p className="text-[var(--so-muted)]">No notifications.</p>;
  return (
    <ul className="space-y-1.5">
      {rows.map((n) => (
        <li
          key={n.id}
          className={`rounded-xl border px-2.5 py-2 ${
            n.readAt
              ? "border-[var(--so-border)] bg-[var(--so-surface-2)]"
              : "border-amber-200 bg-amber-50"
          }`}
        >
          <div className="text-[12px] font-semibold text-[var(--so-text)]">{n.title}</div>
          <div className="text-[10px] text-[var(--so-muted)]">
            {n.readAt ? "Read" : "Unread"}
          </div>
        </li>
      ))}
    </ul>
  );
}
