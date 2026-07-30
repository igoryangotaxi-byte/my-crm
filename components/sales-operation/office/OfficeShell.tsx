"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Box, Layers, RefreshCw, Settings2 } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useTranslations } from "next-intl";
import { SalesLeadDetailSidebar } from "@/components/sales-operation/SalesPipelineBoard";
import { OfficeScene } from "@/components/sales-operation/office/OfficeSceneDynamic";
import { OfficeWorkbench } from "@/components/sales-operation/office/OfficeWorkbench";
import { useOfficeMode } from "@/components/sales-operation/office/OfficeModeContext";
import {
  completeOfficeTask,
  fetchOfficeCrmSnapshot,
  transitionOfficeLead,
} from "@/lib/sales-operation/office/adapter";
import {
  OFFICE_AGENTS,
  type OfficeAgent,
  type OfficeAgentAction,
  type OfficeAgentId,
  type OfficeWorkbenchMode,
} from "@/lib/sales-operation/office/agents";
import type { OfficeCrmSnapshot, OfficeRoomId } from "@/lib/sales-operation/office/types";
import type { SalesLead, SalesLeadStatus } from "@/lib/sales-operation/types";
import { OFFICE_PERF_PRESETS } from "@/lib/sales-operation/office/performance";

const CLASSIC_ROOM_PATH: Record<OfficeRoomId, string> = {
  reception: "/sales-operation/tasks",
  sales: "/sales-operation/manager-analytics",
  pipeline: "/sales-operation/pipeline",
  calendar: "/sales-operation/calendar",
  tasks: "/sales-operation/tasks",
  dashboard: "/sales-operation/analytics",
  automation: "/sales-operation/automation",
};

const ROOM_WORKBENCH: Partial<Record<OfficeRoomId, OfficeWorkbenchMode>> = {
  reception: { kind: "briefing" },
  sales: { kind: "leads", title: "Sales floor · open deals" },
  pipeline: { kind: "leads", title: "Pipeline wall" },
  calendar: { kind: "meetings" },
  tasks: { kind: "tasks", overdueOnly: true },
  dashboard: { kind: "analytics" },
  automation: { kind: "discovery" },
};

export function OfficeShell() {
  const t = useTranslations("salesOperation.office");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentUser } = useAuth();
  const {
    activeRoom,
    setActiveRoom,
    setFocusEntity,
    focusEntity,
    returnToClassicPath,
    setReturnToClassicPath,
    setMode,
    perf,
    setGraphicsPreset,
    setShadows,
  } = useOfficeMode();

  const [snapshot, setSnapshot] = useState<OfficeCrmSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [perfOpen, setPerfOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<SalesLead | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<OfficeAgentId | null>(null);
  const [workbench, setWorkbench] = useState<OfficeWorkbenchMode | null>({ kind: "briefing" });
  const [pipelineStatusFilter, setPipelineStatusFilter] = useState<SalesLeadStatus | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [stages, setStages] = useState<Array<{ key: string; label: string }>>([]);

  const selectedAgent = useMemo(
    () => OFFICE_AGENTS.find((a) => a.id === selectedAgentId) ?? null,
    [selectedAgentId],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchOfficeCrmSnapshot({ userName: currentUser?.name });
      setSnapshot(data);
      setStages(data.stages);
      const leadId = searchParams.get("leadId");
      if (leadId && data.leadsById[leadId]) {
        setSelectedLead(data.leadsById[leadId]);
        setFocusEntity({ kind: "lead", id: leadId });
        setActiveRoom("pipeline");
        setWorkbench({ kind: "leads", title: "Focused lead" });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("loadError"));
    } finally {
      setLoading(false);
    }
  }, [currentUser?.name, searchParams, setActiveRoom, setFocusEntity, t]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(id);
  }, [load]);

  const openLead = useCallback(
    (leadId: string) => {
      const lead = snapshot?.leadsById[leadId];
      if (!lead) return;
      setSelectedLead(lead);
      setFocusEntity({ kind: "lead", id: leadId });
      setActiveRoom("pipeline");
      setPipelineStatusFilter(null);
      const url = new URL(window.location.href);
      url.searchParams.set("leadId", leadId);
      window.history.replaceState({}, "", url.toString());
    },
    [snapshot, setFocusEntity, setActiveRoom],
  );

  const moveLead = useCallback(
    async (leadId: string, toStatus: SalesLeadStatus) => {
      setActionBusy(true);
      try {
        const lead = await transitionOfficeLead(leadId, toStatus);
        setMessage(t("leadMoved", { status: toStatus }));
        if (lead) {
          setSelectedLead(lead);
          setSnapshot((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              leadsById: { ...prev.leadsById, [lead.id]: lead },
              stickers: prev.stickers.map((s) =>
                s.id === lead.id ? { ...s, status: lead.status } : s,
              ),
            };
          });
        } else {
          void load();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : t("moveError"));
      } finally {
        setActionBusy(false);
      }
    },
    [load, t],
  );

  const completeTask = useCallback(
    async (taskId: string) => {
      setActionBusy(true);
      try {
        await completeOfficeTask(taskId);
        setMessage(t("taskDone"));
        setSnapshot((prev) => {
          if (!prev) return prev;
          const tasks = prev.tasks.filter((task) => task.id !== taskId);
          const overdueTasks = tasks.filter((task) => task.overdue).length;
          return {
            ...prev,
            tasks,
            reception: {
              ...prev.reception,
              overdueTasks,
              briefing: prev.reception.briefing.replace(
                /\d+ overdue tasks/,
                `${overdueTasks} overdue tasks`,
              ),
            },
          };
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : t("taskError"));
      } finally {
        setActionBusy(false);
      }
    },
    [t],
  );

  const goClassic = useCallback(
    (path?: string) => {
      const target = path ?? CLASSIC_ROOM_PATH[activeRoom] ?? returnToClassicPath;
      setReturnToClassicPath(target);
      setMode("classic");
      router.push(target);
    },
    [activeRoom, returnToClassicPath, router, setMode, setReturnToClassicPath],
  );

  const openWorkbench = useCallback(
    (mode: OfficeWorkbenchMode, agent?: OfficeAgent | null) => {
      setWorkbench(mode);
      if (agent) setSelectedAgentId(agent.id);
      if (mode.kind === "leads") {
        setActiveRoom("pipeline");
        setPipelineStatusFilter(mode.status ?? null);
      } else if (mode.kind === "briefing") {
        setActiveRoom("reception");
      } else if (mode.kind === "tasks") {
        setActiveRoom("tasks");
      } else if (mode.kind === "meetings") {
        setActiveRoom("calendar");
      } else if (mode.kind === "analytics") {
        setActiveRoom("dashboard");
      } else if (mode.kind === "discovery") {
        setActiveRoom("automation");
      }
    },
    [setActiveRoom],
  );

  const runAgentAction = useCallback(
    (action: OfficeAgentAction) => {
      if ("classic" in action) {
        goClassic(action.classic);
        return;
      }
      openWorkbench(action.workbench, selectedAgent);
    },
    [goClassic, openWorkbench, selectedAgent],
  );

  const onSelectAgent = useCallback(
    (id: OfficeAgentId) => {
      const agent = OFFICE_AGENTS.find((a) => a.id === id);
      if (!agent) return;
      setSelectedAgentId(id);
      setMessage(null);
      openWorkbench(agent.primary, agent);
    },
    [openWorkbench],
  );

  const onSelectRoom = useCallback(
    (room: OfficeRoomId) => {
      setActiveRoom(room);
      if (room !== "pipeline") setPipelineStatusFilter(null);
      const mode = ROOM_WORKBENCH[room];
      if (mode) {
        setWorkbench(mode);
        if (room === "pipeline") setSelectedAgentId(null);
      }
    },
    [setActiveRoom],
  );

  const talkReception = useCallback(() => {
    const igor = OFFICE_AGENTS.find((a) => a.id === "igor_k") ?? null;
    openWorkbench({ kind: "briefing" }, igor);
  }, [openWorkbench]);

  const receptionStats = useMemo(() => snapshot?.reception, [snapshot]);

  return (
    <div className="relative flex h-[calc(100vh-5.5rem)] min-h-[520px] flex-col overflow-hidden rounded-2xl border border-[var(--so-border)] bg-[var(--so-surface-2)]">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--so-border)] bg-[var(--so-surface)] px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--so-text)]">
          <Box className="h-4 w-4 text-[var(--so-accent)]" />
          {t("title")}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="so-focus-ring inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-[var(--so-border-strong)] px-2.5 text-xs font-semibold text-[var(--so-muted)] hover:bg-[var(--so-surface-hover)]"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            {t("refresh")}
          </button>
          <button
            type="button"
            onClick={() => setPerfOpen((v) => !v)}
            className="so-focus-ring inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-[var(--so-border-strong)] px-2.5 text-xs font-semibold text-[var(--so-muted)] hover:bg-[var(--so-surface-hover)]"
          >
            <Settings2 className="h-3.5 w-3.5" />
            {t("graphics")}
          </button>
          <button
            type="button"
            onClick={() => goClassic()}
            className="so-focus-ring inline-flex h-8 items-center gap-1.5 rounded-[10px] bg-[var(--so-accent)] px-2.5 text-xs font-semibold text-white hover:bg-[var(--so-accent-strong)]"
          >
            <Layers className="h-3.5 w-3.5" />
            {t("classicMode")}
          </button>
        </div>
      </div>

      {perfOpen ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--so-border)] bg-[var(--so-surface)] px-3 py-2 text-xs">
          {(["low", "high", "static"] as const).map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setGraphicsPreset(preset)}
              className={`rounded-lg border px-2.5 py-1 font-semibold ${
                perf.preset === preset
                  ? "border-[var(--so-accent)] bg-[var(--so-accent-soft)] text-[var(--so-accent-strong)]"
                  : "border-[var(--so-border-strong)] text-[var(--so-muted)]"
              }`}
            >
              {t(`preset.${preset}`)}
            </button>
          ))}
          <label className="ml-2 inline-flex items-center gap-1.5 font-medium text-[var(--so-muted)]">
            <input
              type="checkbox"
              checked={perf.shadows}
              disabled={perf.preset === "static"}
              onChange={(e) => setShadows(e.target.checked)}
            />
            {t("shadows")}
          </label>
          <span className="text-[var(--so-muted-2)]">
            FPS ≤ {perf.fpsLimit} · DPR ≤ {OFFICE_PERF_PRESETS[perf.preset].dprMax}
          </span>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1.5 border-b border-[var(--so-border)] bg-[var(--so-surface)] px-3 py-2">
        {(
          [
            "reception",
            "sales",
            "pipeline",
            "calendar",
            "tasks",
            "dashboard",
            "automation",
          ] as OfficeRoomId[]
        ).map((room) => (
          <button
            key={room}
            type="button"
            onClick={() => onSelectRoom(room)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
              activeRoom === room
                ? "bg-[var(--so-accent)] text-white"
                : "bg-[var(--so-surface-2)] text-[var(--so-muted)] hover:text-[var(--so-text)]"
            }`}
          >
            {t(`room.${room}`)}
          </button>
        ))}
        {pipelineStatusFilter ? (
          <button
            type="button"
            onClick={() => setPipelineStatusFilter(null)}
            className="rounded-full border border-[var(--so-border-strong)] bg-[var(--so-accent-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--so-accent-strong)]"
          >
            {t("clearFilter")} · {pipelineStatusFilter}
          </button>
        ) : null}
      </div>

      {/* Quick team strip */}
      <div className="flex flex-wrap gap-1 border-b border-[var(--so-border)] bg-[var(--so-surface)] px-3 py-1.5">
        {OFFICE_AGENTS.map((agent) => (
          <button
            key={agent.id}
            type="button"
            onClick={() => onSelectAgent(agent.id)}
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
              selectedAgentId === agent.id
                ? "text-white"
                : "bg-[var(--so-surface-2)] text-[var(--so-muted)] hover:text-[var(--so-text)]"
            }`}
            style={
              selectedAgentId === agent.id
                ? { backgroundColor: agent.color }
                : undefined
            }
          >
            {agent.name}
          </button>
        ))}
      </div>

      {(error || message) && (
        <div className="space-y-1 border-b border-[var(--so-border)] px-3 py-2 text-xs">
          {error ? <p className="text-rose-600">{error}</p> : null}
          {message ? <p className="text-emerald-700">{message}</p> : null}
        </div>
      )}

      <div className="relative min-h-0 flex-1">
        <OfficeScene
          snapshot={snapshot}
          activeRoom={activeRoom}
          selectedLeadId={
            selectedLead?.id ?? (focusEntity?.kind === "lead" ? focusEntity.id : null)
          }
          selectedAgentId={selectedAgentId}
          pipelineStatusFilter={pipelineStatusFilter}
          perf={perf}
          briefingOpen={activeRoom === "reception" && workbench?.kind === "briefing"}
          onSelectRoom={onSelectRoom}
          onOpenLead={openLead}
          onMoveLead={(id, status) => void moveLead(id, status)}
          onSelectAgent={onSelectAgent}
          onTalkReception={talkReception}
        />

        {receptionStats ? (
          <div className="pointer-events-none absolute left-3 top-3 grid max-w-xs gap-1.5 sm:grid-cols-2">
            {[
              [t("stat.meetings"), receptionStats.meetingsToday],
              [t("stat.newLeads"), receptionStats.newLeads],
              [t("stat.overdue"), receptionStats.overdueTasks],
              [t("stat.notifications"), receptionStats.unreadNotifications],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                className="rounded-xl border border-white/60 bg-white/90 px-2.5 py-1.5 shadow backdrop-blur"
              >
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  {label}
                </div>
                <div className="text-lg font-bold text-slate-900">{value}</div>
              </div>
            ))}
          </div>
        ) : null}

        {workbench ? (
          <OfficeWorkbench
            snapshot={snapshot}
            mode={workbench}
            agent={selectedAgent}
            busy={actionBusy}
            onClose={() => {
              setWorkbench(null);
              setSelectedAgentId(null);
            }}
            onOpenLead={openLead}
            onAdvanceLead={(id, status) => void moveLead(id, status)}
            onCompleteTask={(id) => void completeTask(id)}
            onRunAction={runAgentAction}
            onOpenClassic={goClassic}
          />
        ) : (
          <div className="pointer-events-none absolute bottom-3 left-3 z-10 max-w-[240px] rounded-xl border border-white/70 bg-white/90 px-2.5 py-2 text-[11px] text-slate-600 shadow">
            {t("agentsHint")}
          </div>
        )}

        <p className="pointer-events-none absolute bottom-3 right-3 rounded-lg bg-black/50 px-2 py-1 text-[10px] text-white/90">
          {t("pipelineHint")}
        </p>
      </div>

      <SalesLeadDetailSidebar
        lead={selectedLead}
        stages={stages.map((s, i) => ({
          key: s.key,
          label: s.label,
          orderIndex: i,
          probability: 0,
          isWon: s.key === "signed",
          isLost: s.key === "rejected",
          isTerminal: s.key === "signed" || s.key === "rejected",
          isActive: true,
          color: null,
        }))}
        segments={[]}
        open={Boolean(selectedLead)}
        onClose={() => {
          setSelectedLead(null);
          setFocusEntity(null);
          const url = new URL(window.location.href);
          url.searchParams.delete("leadId");
          window.history.replaceState({}, "", url.toString());
        }}
        onUpdated={(lead) => {
          setSelectedLead(lead);
          void load();
        }}
        onDeleted={() => {
          setSelectedLead(null);
          void load();
        }}
        onRequestStageTransition={(lead, toStatus) => {
          void moveLead(lead.id, toStatus);
        }}
      />
    </div>
  );
}
