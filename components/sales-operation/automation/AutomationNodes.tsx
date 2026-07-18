"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { ReactNode } from "react";
import type {
  ActionAssignManagerData,
  ActionCreateTaskData,
  ActionSmsData,
  TriggerLeadStatusData,
} from "@/lib/sales-operation/automation/types";

const shell =
  "min-w-[180px] max-w-[220px] rounded-[14px] border border-[var(--so-border)] bg-[var(--so-surface)] px-3 py-2.5 shadow-[var(--so-shadow-sm)]";

function NodeChrome({
  title,
  tone,
  children,
  showTarget = true,
  showSource = true,
}: {
  title: string;
  tone: "trigger" | "sms" | "assign" | "task";
  children: ReactNode;
  showTarget?: boolean;
  showSource?: boolean;
}) {
  const badge =
    tone === "trigger"
      ? "bg-red-50 text-red-700"
      : tone === "sms"
        ? "bg-sky-50 text-sky-800"
        : tone === "task"
          ? "bg-amber-50 text-amber-800"
          : "bg-emerald-50 text-emerald-800";

  return (
    <div className={shell}>
      {showTarget ? (
        <Handle
          type="target"
          position={Position.Left}
          className="!h-2.5 !w-2.5 !border-2 !border-white !bg-red-500"
        />
      ) : null}
      <p className={`mb-1 inline-flex rounded-lg px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide ${badge}`}>
        {title}
      </p>
      <div className="text-xs text-[var(--so-muted)]">{children}</div>
      {showSource ? (
        <Handle
          type="source"
          position={Position.Right}
          className="!h-2.5 !w-2.5 !border-2 !border-white !bg-red-500"
        />
      ) : null}
    </div>
  );
}

export function TriggerLeadStatusNode({ data }: NodeProps) {
  const d = data as TriggerLeadStatusData & {
    fromStatusLabel?: string;
    toStatusLabel?: string;
  };
  return (
    <NodeChrome title="Trigger" tone="trigger" showTarget={false}>
      <p className="font-medium text-[var(--so-text)]">Lead status</p>
      <p className="mt-1 text-[0.7rem] text-[var(--so-muted-2)]">
        {d.fromStatusLabel ?? d.fromStatus ?? "*"} → {d.toStatusLabel ?? d.toStatus ?? "*"}
      </p>
    </NodeChrome>
  );
}

export function ActionSmsNode({ data }: NodeProps) {
  const d = data as ActionSmsData;
  const preview = (d.text ?? "").trim();
  return (
    <NodeChrome title="SMS" tone="sms">
      <p className="font-medium text-[var(--so-text)]">InforU SMS</p>
      <p className="mt-1 line-clamp-2 text-[0.7rem] text-[var(--so-muted-2)]">
        {preview || "Configure message…"}
      </p>
    </NodeChrome>
  );
}

export function ActionAssignManagerNode({ data }: NodeProps) {
  const d = data as ActionAssignManagerData;
  const label =
    d.mode === "round_robin"
      ? `Round robin (${(d.userIds ?? []).length})`
      : d.userName || d.userId || "Pick manager…";
  return (
    <NodeChrome title="Assign" tone="assign">
      <p className="font-medium text-[var(--so-text)]">Manager</p>
      <p className="mt-1 line-clamp-2 text-[0.7rem] text-[var(--so-muted-2)]">{label}</p>
    </NodeChrome>
  );
}

export function ActionCreateTaskNode({ data }: NodeProps) {
  const d = data as ActionCreateTaskData;
  const preview = (d.title ?? "").trim();
  return (
    <NodeChrome title="Task" tone="task">
      <p className="font-medium text-[var(--so-text)]">Create task</p>
      <p className="mt-1 line-clamp-2 text-[0.7rem] text-[var(--so-muted-2)]">
        {preview || "Configure task…"}
      </p>
    </NodeChrome>
  );
}

export const automationNodeTypes = {
  triggerLeadStatus: TriggerLeadStatusNode,
  actionSms: ActionSmsNode,
  actionAssignManager: ActionAssignManagerNode,
  actionCreateTask: ActionCreateTaskNode,
};
