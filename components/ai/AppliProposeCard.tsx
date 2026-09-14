"use client";

import { Button } from "@/components/ui/Button";
import type { AiRiskLevel, AiUiBlock } from "@/lib/ai/types";

export function AppliProposeCard({
  block,
  onApprove,
  onCancel,
  approveLabel,
  cancelLabel,
  busy,
  settled,
}: {
  block: AiUiBlock;
  onApprove?: (token: string) => void;
  onCancel?: (token: string) => void;
  approveLabel: string;
  cancelLabel: string;
  busy?: boolean;
  settled?: "approved" | "cancelled";
}) {
  if (block.type === "confirmation") {
    const risk = block.risk ?? inferRisk(block.tool);
    const primary = risk >= 2;
    return (
      <div className="mt-2 rounded-[12px] border border-[var(--so-border)] p-3 text-left text-sm">
        <div className="flex items-start justify-between gap-2">
          <div className="font-medium text-[var(--so-text)]">{block.title}</div>
          <RiskBadge risk={risk} />
        </div>
        {block.why ? <p className="ycds-small mt-1 text-[var(--so-muted)]">{block.why}</p> : null}
        <p className="mt-1 whitespace-pre-wrap text-[var(--so-muted)]">{block.body}</p>
        {settled ? (
          <p className="ycds-small mt-2 text-[var(--so-muted)]">
            {settled === "approved" ? approveLabel : cancelLabel}
          </p>
        ) : (
          <div className="mt-3 flex gap-2">
            {primary ? (
              <button
                type="button"
                className="crm-button-primary rounded-lg px-3 py-1.5 text-sm disabled:opacity-50"
                disabled={busy}
                onClick={() => onApprove?.(block.token)}
              >
                {approveLabel}
              </button>
            ) : (
              <button
                type="button"
                className="rounded-lg border border-[var(--so-accent)] px-3 py-1.5 text-sm text-[var(--so-accent-strong)] disabled:opacity-50"
                disabled={busy}
                onClick={() => onApprove?.(block.token)}
              >
                {approveLabel}
              </button>
            )}
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => onCancel?.(block.token)}>
              {cancelLabel}
            </Button>
          </div>
        )}
      </div>
    );
  }

  if (block.type === "propose") {
    return (
      <div className="mt-2 rounded-[12px] border border-[var(--so-border)] p-3 text-left text-sm">
        <div className="flex items-start justify-between gap-2">
          <div className="font-medium text-[var(--so-text)]">{block.title}</div>
          <RiskBadge risk={block.risk} />
        </div>
        {block.why ? <p className="ycds-small mt-1 text-[var(--so-muted)]">{block.why}</p> : null}
        <p className="mt-1 whitespace-pre-wrap text-[var(--so-muted)]">{block.body}</p>
        {block.href ? (
          <a
            href={block.href}
            className="crm-button-primary mt-3 inline-flex rounded-lg px-3 py-1.5 text-sm"
          >
            {approveLabel}
          </a>
        ) : null}
      </div>
    );
  }

  if (block.type === "meeting_slots") {
    return (
      <div className="mt-2 space-y-1 rounded-[12px] border border-[var(--so-border)] p-3 text-left text-sm">
        {block.slots.map((slot) => (
          <div key={slot.start}>
            {new Date(slot.start).toLocaleString()} — {slot.reason}
          </div>
        ))}
      </div>
    );
  }
  if (block.type === "metric") {
    return (
      <div className="mt-2 rounded-[12px] border border-[var(--so-border)] p-3 text-left text-sm">
        <div className="font-medium">{block.title}</div>
        <p className="mt-1">{block.fact}</p>
        {block.inference ? <p className="mt-1 text-[var(--so-muted)]">{block.inference}</p> : null}
        {block.recommendation ? <p className="mt-1">{block.recommendation}</p> : null}
      </div>
    );
  }
  if (block.type === "meeting_preview") {
    return (
      <div className="mt-2 rounded-[12px] border border-[var(--so-border)] p-3 text-left text-sm">
        <div className="font-medium">{block.title}</div>
        <p className="mt-1 text-[var(--so-muted)]">
          {new Date(block.start).toLocaleString()} – {new Date(block.end).toLocaleString()}
        </p>
        {block.attendees?.length ? <p className="mt-1">{block.attendees.join(", ")}</p> : null}
      </div>
    );
  }
  if (block.type === "task_preview") {
    return (
      <div className="mt-2 rounded-[12px] border border-[var(--so-border)] p-3 text-left text-sm">
        <div className="font-medium">{block.title}</div>
        <p className="mt-1 text-[var(--so-muted)]">
          {[block.assignee, block.dueAt ? new Date(block.dueAt).toLocaleString() : null]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
    );
  }
  if (block.type === "status") {
    return <p className="mt-2 text-xs text-[var(--so-muted)]">{block.text}</p>;
  }
  if (block.type === "connect") {
    const href =
      block.href ??
      (block.integration === "gmail"
        ? "/api/ai/integrations/gmail/connect"
        : block.integration === "googleCalendar"
          ? "/api/google/calendar/connect"
          : block.integration === "yango"
            ? "/sales-operation/api-health-check"
            : block.integration === "notes"
              ? "/notes"
              : "/sales-operation/settings");
    return (
      <a href={href} className="mt-2 block rounded-[12px] border border-[var(--so-border)] p-3 text-left text-sm">
        {block.text}
      </a>
    );
  }
  return null;
}

function RiskBadge({ risk }: { risk: AiRiskLevel }) {
  return (
    <span className="ycds-small shrink-0 rounded-full border border-[var(--so-border)] px-1.5 py-0.5 text-[var(--so-muted)]">
      R{risk}
    </span>
  );
}

function inferRisk(tool: string): AiRiskLevel {
  if (tool.includes("cancel") || tool.includes("delete")) return 3;
  if (tool.startsWith("yango.orders") || tool.includes("send")) return 2;
  return 1;
}
