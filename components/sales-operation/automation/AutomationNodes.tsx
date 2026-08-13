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
  "min-w-[180px] max-w-[220px] rounded-[12px] border border-[var(--so-border)] bg-[var(--so-surface)] px-3 py-2.5 shadow-[var(--so-shadow-sm)]";

function NodeChrome({
  title,
  tone,
  children,
  showTarget = true,
  showSource = true,
}: {
  title: string;
  tone: "trigger" | "sms" | "assign" | "task" | "condition";
  children: ReactNode;
  showTarget?: boolean;
  showSource?: boolean;
}) {
  const badge =
    tone === "trigger"
      ? "bg-[var(--so-accent-soft)] text-[var(--so-accent-strong)]"
      : tone === "sms"
        ? "bg-[var(--info-soft)] text-[var(--info)]"
        : tone === "task"
          ? "bg-[var(--warning-soft)] text-[var(--warning)]"
          : tone === "condition"
            ? "bg-[var(--so-surface-2)] text-[var(--so-text)]"
            : "bg-[var(--success-soft)] text-[var(--success)]";

  return (
    <div className={shell}>
      {showTarget ? (
        <Handle
          type="target"
          position={Position.Left}
          className="!h-2.5 !w-2.5 !border-2 !border-white !bg-[var(--primary)]"
        />
      ) : null}
      <p className={`mb-1 inline-flex rounded-[6px] px-1.5 py-0.5 text-[0.65rem] font-medium ${badge}`}>
        {title}
      </p>
      <div className="text-xs text-[var(--so-muted)]">{children}</div>
      {showSource ? (
        <Handle
          type="source"
          position={Position.Right}
          className="!h-2.5 !w-2.5 !border-2 !border-white !bg-[var(--primary)]"
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

function GenericNode({
  title,
  tone,
  subtitle,
  showTarget = true,
}: {
  title: string;
  tone: "trigger" | "sms" | "assign" | "task" | "condition";
  subtitle: string;
  showTarget?: boolean;
}) {
  return (
    <NodeChrome title={title} tone={tone} showTarget={showTarget}>
      <p className="font-medium text-[var(--so-text)]">{subtitle}</p>
    </NodeChrome>
  );
}

export function TriggerLeadDiscoveredNode() {
  return <GenericNode title="Trigger" tone="trigger" subtitle="Lead discovered" showTarget={false} />;
}
export function TriggerQualificationCompletedNode() {
  return (
    <GenericNode title="Trigger" tone="trigger" subtitle="Qualification completed" showTarget={false} />
  );
}
export function TriggerDailyTargetNotReachedNode() {
  return (
    <GenericNode title="Trigger" tone="trigger" subtitle="Daily target not reached" showTarget={false} />
  );
}
export function TriggerEmailRepliedNode() {
  return <GenericNode title="Trigger" tone="trigger" subtitle="Email replied" showTarget={false} />;
}
export function ConditionGateNode({ data }: NodeProps) {
  const d = data as { field?: string; op?: string; value?: unknown };
  return (
    <GenericNode
      title="If"
      tone="condition"
      subtitle={`${d.field ?? "field"} ${d.op ?? "eq"} ${String(d.value ?? "")}`}
    />
  );
}
export function ActionAddStickerNode({ data }: NodeProps) {
  const d = data as { stickerKey?: string };
  return <GenericNode title="Sticker" tone="task" subtitle={d.stickerKey || "Add sticker"} />;
}
export function ActionNotifyNode({ data }: NodeProps) {
  const d = data as { title?: string };
  return <GenericNode title="Notify" tone="sms" subtitle={d.title || "Internal notification"} />;
}
export function ActionStartEmailSequenceNode({ data }: NodeProps) {
  const d = data as { sequenceId?: string };
  return (
    <GenericNode title="Sequence" tone="sms" subtitle={d.sequenceId || "Start email sequence"} />
  );
}

export const automationNodeTypes = {
  triggerLeadStatus: TriggerLeadStatusNode,
  triggerLeadDiscovered: TriggerLeadDiscoveredNode,
  triggerQualificationCompleted: TriggerQualificationCompletedNode,
  triggerDailyTargetNotReached: TriggerDailyTargetNotReachedNode,
  triggerEmailReplied: TriggerEmailRepliedNode,
  conditionGate: ConditionGateNode,
  actionSms: ActionSmsNode,
  actionAssignManager: ActionAssignManagerNode,
  actionCreateTask: ActionCreateTaskNode,
  actionAddSticker: ActionAddStickerNode,
  actionNotify: ActionNotifyNode,
  actionStartEmailSequence: ActionStartEmailSequenceNode,
};
