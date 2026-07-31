"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Box, Layers, RefreshCw, Settings2 } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useTranslations } from "next-intl";
import { SalesLeadDetailSidebar } from "@/components/sales-operation/SalesPipelineBoard";
import {
  StageGateModal,
  type StageGateConfirmPayload,
} from "@/components/sales-operation/StageGateModal";
import { OfficeScene } from "@/components/sales-operation/office/OfficeSceneDynamic";
import { OfficeOpsDock } from "@/components/sales-operation/office/OfficeOpsDock";
import { useOfficeMode } from "@/components/sales-operation/office/OfficeModeContext";
import {
  assignOfficeLeadToMe,
  completeOfficeTask,
  fetchOfficeCrmSnapshot,
  markOfficeNotificationsRead,
  transitionOfficeLead,
  type OfficeTransitionPayload,
} from "@/lib/sales-operation/office/adapter";
import { buildAttentionItems } from "@/lib/sales-operation/office/attention";
import type {
  OfficeCrmSnapshot,
  OfficeDockTab,
  OfficeIntentAction,
  OfficePipelineFilter,
  OfficeRoomId,
} from "@/lib/sales-operation/office/types";
import { isStuckLead } from "@/lib/sales-operation/office/types";
import type { StageMissingField } from "@/lib/sales-operation/status-transitions";
import type { SalesLead, SalesLeadStatus } from "@/lib/sales-operation/types";
import { OFFICE_PERF_PRESETS } from "@/lib/sales-operation/office/performance";

const CLASSIC_ROOM_PATH: Record<OfficeRoomId, string> = {
  reception: "/sales-operation/tasks",
  sales: "/sales-operation/manager-analytics",
  pipeline: "/sales-operation/pipeline",
  calendar: "/sales-operation/calendar",
  tasks: "/sales-operation/tasks",
  dashboard: "/sales-operation/analytics",
  automation: "/sales-operation/lead-discovery",
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
  const [selectedManagerId, setSelectedManagerId] = useState<string | null>(null);
  const [dockTab, setDockTab] = useState<OfficeDockTab>("attention");
  const [dockOpen, setDockOpen] = useState(true);
  const [pipelineFilter, setPipelineFilter] = useState<OfficePipelineFilter>({ kind: "all" });
  const [actionBusy, setActionBusy] = useState(false);
  const [stages, setStages] = useState<Array<{ key: string; label: string }>>([]);
  const [askValue, setAskValue] = useState("");
  const [askBusy, setAskBusy] = useState(false);
  const [askReply, setAskReply] = useState<string | null>(null);

  const [gateOpen, setGateOpen] = useState(false);
  const [gateLead, setGateLead] = useState<SalesLead | null>(null);
  const [gateToStatus, setGateToStatus] = useState<SalesLeadStatus | null>(null);
  const [gateMissing, setGateMissing] = useState<StageMissingField[]>([]);
  const [gateLoading, setGateLoading] = useState(false);

  const currentUserId = currentUser?.id ?? null;

  const refreshAttention = useCallback((prev: OfficeCrmSnapshot): OfficeCrmSnapshot => {
    const openLeads = Object.values(prev.leadsById).filter(
      (l) => l.status !== "signed" && l.status !== "rejected",
    );
    return {
      ...prev,
      attention: buildAttentionItems({
        tasks: prev.tasks,
        leads: openLeads,
        meetings: prev.meetings,
        notifications: prev.notifications,
      }),
      reception: {
        ...prev.reception,
        overdueTasks: prev.tasks.filter((task) => task.overdue).length,
        unreadNotifications: prev.notifications.filter((n) => !n.isRead).length,
        unassignedNew: openLeads.filter((l) => l.status === "new" && !l.assignedManagerUserId)
          .length,
        stuckDeals: openLeads.filter((l) => isStuckLead(l)).length,
      },
    };
  }, []);

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
        setDockTab("my_desk");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("loadError"));
    } finally {
      setLoading(false);
    }
  }, [currentUser, searchParams, setActiveRoom, setFocusEntity, t]);

  useEffect(() => {
    const boot = window.setTimeout(() => void load(), 0);
    const id = window.setInterval(() => void load(), 60_000);
    return () => {
      window.clearTimeout(boot);
      window.clearInterval(id);
    };
  }, [load]);

  const openLead = useCallback(
    (leadId: string) => {
      const lead = snapshot?.leadsById[leadId];
      if (!lead) return;
      setSelectedLead(lead);
      setFocusEntity({ kind: "lead", id: leadId });
      setActiveRoom("pipeline");
      const url = new URL(window.location.href);
      url.searchParams.set("leadId", leadId);
      window.history.replaceState({}, "", url.toString());
    },
    [snapshot, setFocusEntity, setActiveRoom],
  );

  const applyLeadUpdate = useCallback(
    (lead: SalesLead) => {
      setSelectedLead(lead);
      setSnapshot((prev) => {
        if (!prev) return prev;
        const stickers = prev.stickers.map((s) =>
          s.id === lead.id
            ? {
                ...s,
                status: lead.status,
                ownerUserId: lead.assignedManagerUserId ?? null,
                ownerName: lead.assignedManagerName ?? null,
              }
            : s,
        );
        const next = refreshAttention({
          ...prev,
          leadsById: { ...prev.leadsById, [lead.id]: lead },
          stickers,
        });
        return next;
      });
    },
    [refreshAttention],
  );

  const moveLead = useCallback(
    async (
      leadId: string,
      toStatus: SalesLeadStatus,
      payload?: OfficeTransitionPayload,
    ): Promise<boolean> => {
      setActionBusy(true);
      setError(null);
      try {
        const result = await transitionOfficeLead(leadId, toStatus, payload);
        if (!result.ok && result.needsGate) {
          setGateLead(result.lead ?? snapshot?.leadsById[leadId] ?? null);
          setGateToStatus(toStatus);
          setGateMissing(result.missing);
          setGateOpen(true);
          return false;
        }
        if (!result.ok) {
          setError(result.error);
          return false;
        }
        setMessage(t("leadMoved", { status: toStatus }));
        applyLeadUpdate(result.lead);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : t("moveError"));
        return false;
      } finally {
        setActionBusy(false);
      }
    },
    [applyLeadUpdate, snapshot, t],
  );

  const confirmGate = useCallback(
    async (payload: StageGateConfirmPayload) => {
      if (!gateLead || !gateToStatus) return;
      setGateLoading(true);
      try {
        const ok = await moveLead(gateLead.id, gateToStatus, payload);
        if (ok) setGateOpen(false);
      } finally {
        setGateLoading(false);
      }
    },
    [gateLead, gateToStatus, moveLead],
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
          return refreshAttention({ ...prev, tasks });
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : t("taskError"));
      } finally {
        setActionBusy(false);
      }
    },
    [refreshAttention, t],
  );

  const assignMe = useCallback(
    async (leadId: string) => {
      if (!currentUser?.id) {
        setError(t("assignError"));
        return;
      }
      setActionBusy(true);
      try {
        const lead = await assignOfficeLeadToMe(leadId, {
          id: currentUser.id,
          name: currentUser.name || currentUser.email || "Me",
        });
        setMessage(t("assigned"));
        applyLeadUpdate(lead);
        setDockTab("my_desk");
        setPipelineFilter({ kind: "mine" });
      } catch (err) {
        setError(err instanceof Error ? err.message : t("assignError"));
      } finally {
        setActionBusy(false);
      }
    },
    [applyLeadUpdate, currentUser, t],
  );

  const markNotificationRead = useCallback(
    async (id: string) => {
      setActionBusy(true);
      try {
        await markOfficeNotificationsRead([id]);
        setSnapshot((prev) => {
          if (!prev) return prev;
          const notifications = prev.notifications.map((n) =>
            n.id === id ? { ...n, isRead: true } : n,
          );
          return refreshAttention({ ...prev, notifications });
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : t("notifError"));
      } finally {
        setActionBusy(false);
      }
    },
    [refreshAttention, t],
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

  const onSelectManager = useCallback(
    (managerId: string | null) => {
      setSelectedManagerId(managerId);
      setDockOpen(true);
      setDockTab("team");
      if (managerId) {
        setPipelineFilter({ kind: "owner", ownerUserId: managerId });
        setActiveRoom("sales");
        setFocusEntity({ kind: "manager", id: managerId });
      } else {
        setPipelineFilter({ kind: "all" });
      }
    },
    [setActiveRoom, setFocusEntity],
  );

  const onSelectRoom = useCallback(
    (room: OfficeRoomId) => {
      setActiveRoom(room);
      setDockOpen(true);
      if (room === "reception") {
        setDockTab("attention");
        setPipelineFilter({ kind: "all" });
      } else if (room === "sales") {
        setDockTab("team");
      } else if (room === "pipeline") {
        setDockTab(dockTab === "team" ? "team" : "my_desk");
      } else if (room === "calendar" || room === "tasks" || room === "dashboard" || room === "automation") {
        // Honest rooms: keep camera, deep-link via dock / classic CTA in scene
      }
    },
    [dockTab, setActiveRoom],
  );

  const executeIntent = useCallback(
    (action: OfficeIntentAction) => {
      switch (action.type) {
        case "open_dock":
          setDockOpen(true);
          setDockTab(action.tab);
          if (action.filter) setPipelineFilter(action.filter);
          if (action.ownerUserId) {
            setSelectedManagerId(action.ownerUserId);
            setPipelineFilter({ kind: "owner", ownerUserId: action.ownerUserId });
          }
          if (action.tab === "attention") setActiveRoom("reception");
          if (action.tab === "my_desk") setActiveRoom("pipeline");
          if (action.tab === "team") setActiveRoom("sales");
          break;
        case "open_room":
          onSelectRoom(action.roomId);
          break;
        case "open_classic":
          goClassic(action.path);
          break;
        case "open_lead":
          openLead(action.leadId);
          break;
        case "open_pipeline":
          setActiveRoom("pipeline");
          setDockTab("my_desk");
          setPipelineFilter(
            action.status ? { kind: "status", status: action.status } : { kind: "all" },
          );
          break;
        case "noop":
          break;
      }
    },
    [goClassic, onSelectRoom, openLead, setActiveRoom],
  );

  const onAskSubmit = useCallback(async () => {
    if (!askValue.trim()) return;
    setAskBusy(true);
    setAskReply(null);
    try {
      const res = await fetch("/api/sales-operation/office/intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: askValue, roomId: activeRoom }),
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        action?: OfficeIntentAction;
        reply?: string;
        error?: string;
      } | null;
      if (!res.ok || !data?.action) {
        setAskReply(data?.error ?? t("intentError"));
        return;
      }
      setAskReply(data.reply ?? null);
      executeIntent(data.action);
      setAskValue("");
    } catch {
      setAskReply(t("intentError"));
    } finally {
      setAskBusy(false);
    }
  }, [activeRoom, askValue, executeIntent, t]);

  const receptionStats = useMemo(() => snapshot?.reception, [snapshot]);

  const managersStrip = snapshot?.managers ?? [];

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
        {pipelineFilter.kind !== "all" ? (
          <button
            type="button"
            onClick={() => setPipelineFilter({ kind: "all" })}
            className="rounded-full border border-[var(--so-border-strong)] bg-[var(--so-accent-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--so-accent-strong)]"
          >
            {t("clearFilter")}
          </button>
        ) : null}
      </div>

      {managersStrip.length ? (
        <div className="flex flex-wrap gap-1 border-b border-[var(--so-border)] bg-[var(--so-surface)] px-3 py-1.5">
          {managersStrip.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onSelectManager(m.id)}
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                selectedManagerId === m.id
                  ? "text-white"
                  : "bg-[var(--so-surface-2)] text-[var(--so-muted)] hover:text-[var(--so-text)]"
              }`}
              style={selectedManagerId === m.id ? { backgroundColor: m.color } : undefined}
            >
              {m.name}
              {m.stuckLeads > 0 ? ` · ${m.stuckLeads}` : ""}
            </button>
          ))}
        </div>
      ) : null}

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
          selectedManagerId={selectedManagerId}
          pipelineFilter={pipelineFilter}
          currentUserId={currentUserId}
          perf={perf}
          briefingOpen={activeRoom === "reception" && dockTab === "attention"}
          onSelectRoom={onSelectRoom}
          onOpenLead={openLead}
          onMoveLead={(id, status) => void moveLead(id, status)}
          onSelectManager={onSelectManager}
          onOpenAttention={() => {
            setDockOpen(true);
            setDockTab("attention");
            setActiveRoom("reception");
          }}
          onOpenClassic={goClassic}
        />

        {receptionStats ? (
          <div className="pointer-events-none absolute left-3 top-3 grid max-w-xs gap-1.5 sm:grid-cols-2">
            {[
              [t("stat.overdue"), receptionStats.overdueTasks],
              [t("stat.unassigned"), receptionStats.unassignedNew],
              [t("stat.stuck"), receptionStats.stuckDeals],
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

        {dockOpen ? (
          <OfficeOpsDock
            snapshot={snapshot}
            tab={dockTab}
            currentUserId={currentUserId}
            selectedManagerId={selectedManagerId}
            pipelineFilter={pipelineFilter}
            busy={actionBusy}
            askValue={askValue}
            askBusy={askBusy}
            askReply={askReply}
            onTabChange={(tab) => {
              setDockTab(tab);
              if (tab === "my_desk") setPipelineFilter({ kind: "mine" });
              if (tab === "attention") setPipelineFilter({ kind: "all" });
            }}
            onAskChange={setAskValue}
            onAskSubmit={() => void onAskSubmit()}
            onSelectManager={onSelectManager}
            onSetFilter={setPipelineFilter}
            onOpenLead={openLead}
            onAdvanceLead={(id, status) => void moveLead(id, status)}
            onCompleteTask={(id) => void completeTask(id)}
            onAssignMe={(id) => void assignMe(id)}
            onMarkNotificationRead={(id) => void markNotificationRead(id)}
            onOpenClassic={goClassic}
            onClose={() => setDockOpen(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setDockOpen(true)}
            className="absolute bottom-3 left-3 z-30 inline-flex items-center gap-2 rounded-2xl border border-[var(--so-border)] bg-[var(--so-surface)]/97 px-3 py-2 text-xs font-bold text-[var(--so-text)] shadow-2xl backdrop-blur hover:bg-[var(--so-surface-hover)]"
          >
            <Box className="h-3.5 w-3.5 text-[var(--so-accent)]" />
            {t("openDock")}
            {receptionStats && receptionStats.overdueTasks + receptionStats.stuckDeals > 0 ? (
              <span className="rounded-full bg-[var(--so-accent)] px-1.5 py-0.5 text-[10px] text-white">
                {receptionStats.overdueTasks + receptionStats.stuckDeals}
              </span>
            ) : null}
          </button>
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

      <StageGateModal
        open={gateOpen}
        onOpenChange={setGateOpen}
        lead={gateLead}
        toStatus={gateToStatus}
        missing={gateMissing}
        loading={gateLoading}
        onConfirm={confirmGate}
      />
    </div>
  );
}
