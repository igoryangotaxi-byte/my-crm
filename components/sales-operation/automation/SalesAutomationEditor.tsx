"use client";

import "@xyflow/react/dist/style.css";

import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type OnSelectionChangeParams,
} from "@xyflow/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { automationNodeTypes } from "@/components/sales-operation/automation/AutomationNodes";
import type {
  ActionAssignManagerData,
  ActionCreateTaskData,
  ActionSmsData,
  SalesAutomation,
  StatusMatch,
  TriggerLeadStatusData,
} from "@/lib/sales-operation/automation/types";
import { SALES_LEAD_STATUSES, type SalesLeadStatus } from "@/lib/sales-operation/types";
import type { CrmManagerUserOption } from "@/lib/sales-operation/crm-manager-users";

function newId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `n_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

type EditorInnerProps = {
  automationId: string;
};

function EditorInner({ automationId }: EditorInnerProps) {
  const t = useTranslations("salesOperation");
  const router = useRouter();
  const rf = useReactFlow();
  const [name, setName] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [managers, setManagers] = useState<CrmManagerUserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [pendingViewport, setPendingViewport] = useState<{
    x: number;
    y: number;
    zoom: number;
  } | null>(null);

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedId) ?? null,
    [nodes, selectedId],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [autoRes, mgrRes] = await Promise.all([
          fetch(`/api/sales-operation/automations/${automationId}`, { cache: "no-store" }),
          fetch("/api/sales-operation/automations/managers", { cache: "no-store" }),
        ]);
        const autoData = (await autoRes.json()) as {
          ok?: boolean;
          automation?: SalesAutomation;
          error?: string;
        };
        const mgrData = (await mgrRes.json()) as {
          ok?: boolean;
          managers?: CrmManagerUserOption[];
          error?: string;
        };
        if (!autoRes.ok || !autoData.ok || !autoData.automation) {
          throw new Error(autoData.error ?? "Failed to load automations.");
        }
        if (cancelled) return;
        const automation = autoData.automation;
        setName(automation.name);
        setEnabled(automation.enabled);
        setNodes(automation.graph.nodes ?? []);
        setEdges(automation.graph.edges ?? []);
        setPendingViewport(automation.graph.viewport ?? null);
        if (mgrRes.ok && mgrData.ok) {
          setManagers(mgrData.managers ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load automations.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per id; rf/t identities are unstable
  }, [automationId, setEdges, setNodes]);

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => addEdge({ ...connection, id: `e_${newId()}` }, eds));
    },
    [setEdges],
  );

  const onSelectionChange = useCallback((params: OnSelectionChangeParams) => {
    setSelectedId(params.nodes[0]?.id ?? null);
  }, []);

  const addNode = (
    type: "triggerLeadStatus" | "actionSms" | "actionAssignManager" | "actionCreateTask",
  ) => {
    const center = rf.screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
    const id = newId();
    let data: Record<string, unknown> = {};
    if (type === "triggerLeadStatus") {
      data = { fromStatus: "*", toStatus: "in_progress" } satisfies TriggerLeadStatusData;
    } else if (type === "actionSms") {
      data = {
        text: "Hi {{full_name}}, your request status is {{status}}.",
      } satisfies ActionSmsData;
    } else if (type === "actionCreateTask") {
      data = {
        title: "Follow up with {{full_name}}",
        taskType: "call",
        priority: "normal",
        dueInDays: 1,
        assignToLeadOwner: true,
      } satisfies ActionCreateTaskData;
    } else {
      data = { mode: "fixed", userIds: [], userNames: {} } satisfies ActionAssignManagerData;
    }
    setNodes((prev) => [
      ...prev,
      {
        id,
        type,
        position: { x: center.x - 90, y: center.y - 40 },
        data,
      },
    ]);
    setSelectedId(id);
  };

  const updateSelectedData = (patch: Record<string, unknown>) => {
    if (!selectedId) return;
    setNodes((prev) =>
      prev.map((node) =>
        node.id === selectedId ? { ...node, data: { ...node.data, ...patch } } : node,
      ),
    );
  };

  const save = async () => {
    setSaving(true);
    setSaveState("idle");
    setError(null);
    try {
      const viewport = rf.getViewport();
      const res = await fetch(`/api/sales-operation/automations/${automationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          enabled,
          graph: { nodes, edges, viewport },
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? t("automation.saveError"));
      setSaveState("saved");
      window.setTimeout(() => setSaveState("idle"), 1500);
    } catch (err) {
      setSaveState("error");
      setError(err instanceof Error ? err.message : t("automation.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const deleteWorkflow = async () => {
    if (!window.confirm(t("automation.deleteConfirm"))) return;
    try {
      const res = await fetch(`/api/sales-operation/automations/${automationId}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? t("automation.saveError"));
      router.push("/sales-operation/automation");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("automation.saveError"));
    }
  };

  const statusOptions: Array<{ value: StatusMatch; label: string }> = [
    { value: "*", label: t("automation.anyStatus") },
    ...SALES_LEAD_STATUSES.map((status) => ({ value: status as SalesLeadStatus, label: status })),
  ];

  if (loading) {
    return (
      <section className="crm-page space-y-3">
        <Link
          href="/sales-operation/automation"
          className="inline-flex rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
        >
          {t("automation.backToList")}
        </Link>
        <div className="crm-surface rounded-3xl p-8 text-sm text-muted">{t("loading")}</div>
        {error ? (
          <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}
      </section>
    );
  }

  return (
    <section className="crm-page flex h-[calc(100dvh-10.5rem)] flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/sales-operation/automation"
          className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
        >
          {t("automation.backToList")}
        </Link>
        <input
          className="crm-input min-w-[12rem] flex-1 rounded-xl px-3 py-2 text-sm font-semibold"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t("automation.namePlaceholder")}
        />
        <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => {
              const next = event.target.checked;
              setEnabled(next);
              void (async () => {
                try {
                  const res = await fetch(`/api/sales-operation/automations/${automationId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ enabled: next }),
                  });
                  const data = (await res.json()) as { ok?: boolean; error?: string };
                  if (!res.ok || !data.ok) throw new Error(data.error ?? t("automation.saveError"));
                } catch (err) {
                  setEnabled(!next);
                  setError(err instanceof Error ? err.message : t("automation.saveError"));
                }
              })();
            }}
          />
          {enabled ? t("automation.enabled") : t("automation.disabled")}
        </label>
        <button
          type="button"
          className="crm-button-primary rounded-xl px-4 py-2 text-sm font-semibold"
          onClick={() => void save()}
          disabled={saving}
        >
          {saving ? t("automation.saving") : saveState === "saved" ? t("automation.saved") : t("automation.save")}
        </button>
        <button
          type="button"
          className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800"
          onClick={() => void deleteWorkflow()}
        >
          {t("automation.delete")}
        </button>
      </div>

      {error ? (
        <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {!enabled ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          {t("automation.disabledBanner")}
        </p>
      ) : null}

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[13rem_minmax(0,1fr)_16rem]">
        <aside className="crm-surface flex flex-col gap-2 rounded-3xl p-3">
          <p className="crm-label text-[0.62rem] tracking-[0.14em]">{t("automation.palette")}</p>
          <button
            type="button"
            className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-left text-xs font-semibold text-red-800"
            onClick={() => addNode("triggerLeadStatus")}
          >
            {t("automation.addTrigger")}
          </button>
          <button
            type="button"
            className="rounded-xl border border-sky-100 bg-sky-50 px-3 py-2 text-left text-xs font-semibold text-sky-900"
            onClick={() => addNode("actionSms")}
          >
            {t("automation.addSms")}
          </button>
          <button
            type="button"
            className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-left text-xs font-semibold text-emerald-900"
            onClick={() => addNode("actionAssignManager")}
          >
            {t("automation.addAssign")}
          </button>
          <button
            type="button"
            className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-left text-xs font-semibold text-amber-900"
            onClick={() => addNode("actionCreateTask")}
          >
            {t("automation.addTask")}
          </button>
        </aside>

        <div className="crm-surface relative min-h-[22rem] overflow-hidden rounded-3xl">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onSelectionChange={onSelectionChange}
            onInit={() => {
              if (pendingViewport) {
                rf.setViewport(pendingViewport);
                setPendingViewport(null);
              }
            }}
            nodeTypes={automationNodeTypes}
            fitView={!pendingViewport}
            proOptions={{ hideAttribution: true }}
            className="bg-gradient-to-br from-slate-50/80 via-white/40 to-red-50/40"
          >
            <Background gap={18} color="rgba(148,163,184,0.35)" />
            <Controls className="!rounded-xl !border-white/70 !bg-white/90 !shadow-md" />
            <MiniMap
              className="!rounded-xl !border-white/70 !bg-white/90"
              nodeColor={() => "#ef4444"}
              maskColor="rgba(15,23,42,0.08)"
            />
          </ReactFlow>
        </div>

        <aside className="crm-surface overflow-y-auto rounded-3xl p-3">
          <p className="crm-label mb-2 text-[0.62rem] tracking-[0.14em]">{t("automation.config")}</p>
          {!selectedNode ? (
            <p className="text-xs text-muted">{t("automation.selectNode")}</p>
          ) : selectedNode.type === "triggerLeadStatus" ? (
            <div className="space-y-3">
              <label className="block space-y-1">
                <span className="crm-label text-[0.65rem]">{t("automation.fromStatus")}</span>
                <select
                  className="crm-input w-full rounded-xl px-2 py-2 text-sm"
                  value={String((selectedNode.data as TriggerLeadStatusData).fromStatus ?? "*")}
                  onChange={(event) =>
                    updateSelectedData({ fromStatus: event.target.value as StatusMatch })
                  }
                >
                  {statusOptions.map((opt) => (
                    <option key={`from-${opt.value}`} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="crm-label text-[0.65rem]">{t("automation.toStatus")}</span>
                <select
                  className="crm-input w-full rounded-xl px-2 py-2 text-sm"
                  value={String((selectedNode.data as TriggerLeadStatusData).toStatus ?? "*")}
                  onChange={(event) =>
                    updateSelectedData({ toStatus: event.target.value as StatusMatch })
                  }
                >
                  {statusOptions.map((opt) => (
                    <option key={`to-${opt.value}`} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : selectedNode.type === "actionSms" ? (
            <div className="space-y-2">
              <label className="block space-y-1">
                <span className="crm-label text-[0.65rem]">{t("automation.smsText")}</span>
                <textarea
                  className="crm-input min-h-[8rem] w-full rounded-xl px-2 py-2 text-sm"
                  value={String((selectedNode.data as ActionSmsData).text ?? "")}
                  onChange={(event) => updateSelectedData({ text: event.target.value })}
                />
              </label>
              <p className="text-[0.7rem] text-muted">{t("automation.smsPlaceholders")}</p>
            </div>
          ) : selectedNode.type === "actionAssignManager" ? (
            <div className="space-y-3">
              <label className="block space-y-1">
                <span className="crm-label text-[0.65rem]">{t("automation.assignMode")}</span>
                <select
                  className="crm-input w-full rounded-xl px-2 py-2 text-sm"
                  value={(selectedNode.data as ActionAssignManagerData).mode ?? "fixed"}
                  onChange={(event) =>
                    updateSelectedData({
                      mode: event.target.value === "round_robin" ? "round_robin" : "fixed",
                    })
                  }
                >
                  <option value="fixed">{t("automation.modeFixed")}</option>
                  <option value="round_robin">{t("automation.modeRoundRobin")}</option>
                </select>
              </label>
              {(selectedNode.data as ActionAssignManagerData).mode === "round_robin" ? (
                <fieldset className="space-y-1">
                  <legend className="crm-label text-[0.65rem]">{t("automation.managers")}</legend>
                  <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2">
                    {managers.map((manager) => {
                      const data = selectedNode.data as ActionAssignManagerData;
                      const checked = (data.userIds ?? []).includes(manager.id);
                      return (
                        <label key={manager.id} className="flex items-center gap-2 text-xs text-slate-800">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) => {
                              const nextIds = event.target.checked
                                ? [...(data.userIds ?? []), manager.id]
                                : (data.userIds ?? []).filter((id) => id !== manager.id);
                              const nextNames = { ...(data.userNames ?? {}) };
                              if (event.target.checked) nextNames[manager.id] = manager.name;
                              else delete nextNames[manager.id];
                              updateSelectedData({ userIds: nextIds, userNames: nextNames });
                            }}
                          />
                          <span>
                            {manager.name}{" "}
                            <span className="text-muted">({manager.role})</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              ) : (
                <label className="block space-y-1">
                  <span className="crm-label text-[0.65rem]">{t("automation.manager")}</span>
                  <select
                    className="crm-input w-full rounded-xl px-2 py-2 text-sm"
                    value={(selectedNode.data as ActionAssignManagerData).userId ?? ""}
                    onChange={(event) => {
                      const manager = managers.find((row) => row.id === event.target.value);
                      updateSelectedData({
                        userId: manager?.id ?? "",
                        userName: manager?.name ?? "",
                      });
                    }}
                  >
                    <option value="">—</option>
                    {managers.map((manager) => (
                      <option key={manager.id} value={manager.id}>
                        {manager.name} ({manager.role})
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          ) : selectedNode.type === "actionCreateTask" ? (
            <div className="space-y-3">
              <label className="block space-y-1">
                <span className="crm-label text-[0.65rem]">{t("automation.taskTitle")}</span>
                <input
                  className="crm-input w-full rounded-xl px-2 py-2 text-sm"
                  value={String((selectedNode.data as ActionCreateTaskData).title ?? "")}
                  onChange={(event) => updateSelectedData({ title: event.target.value })}
                />
                <span className="text-[0.7rem] text-muted">{t("automation.smsPlaceholders")}</span>
              </label>
              <label className="block space-y-1">
                <span className="crm-label text-[0.65rem]">{t("automation.taskType")}</span>
                <select
                  className="crm-input w-full rounded-xl px-2 py-2 text-sm"
                  value={String((selectedNode.data as ActionCreateTaskData).taskType ?? "call")}
                  onChange={(event) => updateSelectedData({ taskType: event.target.value })}
                >
                  {["call", "email", "meeting", "whatsapp", "todo", "other"].map((type) => (
                    <option key={type} value={type}>
                      {t(`taskTypes.${type}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="crm-label text-[0.65rem]">{t("automation.taskPriority")}</span>
                <select
                  className="crm-input w-full rounded-xl px-2 py-2 text-sm"
                  value={String((selectedNode.data as ActionCreateTaskData).priority ?? "normal")}
                  onChange={(event) => updateSelectedData({ priority: event.target.value })}
                >
                  {["low", "normal", "high"].map((priority) => (
                    <option key={priority} value={priority}>
                      {t(`taskPriorities.${priority}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="crm-label text-[0.65rem]">{t("automation.taskDueInDays")}</span>
                <input
                  type="number"
                  min={0}
                  className="crm-input w-full rounded-xl px-2 py-2 text-sm"
                  value={Number((selectedNode.data as ActionCreateTaskData).dueInDays ?? 1)}
                  onChange={(event) =>
                    updateSelectedData({ dueInDays: Math.max(0, Number(event.target.value) || 0) })
                  }
                />
              </label>
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                <input
                  type="checkbox"
                  checked={(selectedNode.data as ActionCreateTaskData).assignToLeadOwner !== false}
                  onChange={(event) =>
                    updateSelectedData({ assignToLeadOwner: event.target.checked })
                  }
                />
                {t("automation.taskAssignToOwner")}
              </label>
            </div>
          ) : (
            <p className="text-xs text-muted">{t("automation.selectNode")}</p>
          )}
        </aside>
      </div>
    </section>
  );
}

export function SalesAutomationEditor({ automationId }: { automationId: string }) {
  return (
    <ReactFlowProvider>
      <EditorInner automationId={automationId} />
    </ReactFlowProvider>
  );
}
