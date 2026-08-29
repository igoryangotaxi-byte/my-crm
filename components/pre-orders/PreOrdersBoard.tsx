"use client";

import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { PreOrdersMapView } from "@/components/pre-orders/PreOrdersMapView";
import { FilterBar, FilterChip } from "@/components/patterns/FilterBar";
import { cn } from "@/lib/ui/cn";
import {
  formatDriverDisplayName,
  getPreOrderUrgencyLabel,
  getPreOrderUrgencyLevel,
  isPreOrderDriverAssigned,
  minutesUntilScheduled,
  preOrderUrgencyRailClass,
  preOrderUrgencyTintClass,
} from "@/lib/preorders/urgency";
import type { PreOrder, PreOrderOperatorContactStatus } from "@/types/crm";

type PreOrdersBoardProps = {
  preOrders: PreOrder[];
  errors: string[];
  /** HUB Controller: uncached live poll + shared operator marks. */
  enableControllerLive?: boolean;
};

type FilterMode = "all" | "today" | "tomorrow" | "range";
type StatusFilter = "all" | "assigned" | "unassigned" | "at_risk";
type ViewMode = "list" | "onMap";

const LIVE_POLL_MS = 15_000;
const CLOCK_TICK_MS = 1_000;

const VIEW_TAB_BASE =
  "relative -mb-px px-3 py-2 text-xs font-medium transition-colors so-focus-ring rounded-t-[6px]";
const VIEW_TAB_ACTIVE =
  "text-[var(--so-text)] after:absolute after:inset-x-1 after:bottom-0 after:h-0.5 after:rounded-full after:bg-[#FF2D2D]";
const VIEW_TAB_IDLE = "text-[var(--so-muted)] hover:text-[var(--so-text)]";

const CONTACT_OPTIONS: Array<{ value: PreOrderOperatorContactStatus; label: string }> = [
  { value: "driver_confirmed", label: "Driver confirmed" },
  { value: "no_answer", label: "No answer" },
  { value: "issue", label: "Issue" },
  { value: "none", label: "Clear mark" },
];

function getScheduledDate(preOrder: PreOrder) {
  if (!preOrder.scheduledAt) return null;
  const date = new Date(preOrder.scheduledAt);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

function formatClock(iso: string | null | undefined) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Jerusalem",
  }).format(date);
}

function contactLabel(status: PreOrderOperatorContactStatus | undefined) {
  switch (status) {
    case "driver_confirmed":
      return "✓ Confirmed";
    case "no_answer":
      return "No answer";
    case "issue":
      return "Issue";
    default:
      return "Mark contact";
  }
}

function contactChipClass(status: PreOrderOperatorContactStatus | undefined) {
  switch (status) {
    case "driver_confirmed":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "no_answer":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "issue":
      return "border-rose-200 bg-rose-50 text-rose-800";
    default:
      return "border-slate-200 bg-white text-slate-600";
  }
}

function buildYangoB2CHandoffUrl(preOrder: PreOrder) {
  const url = new URL("https://yango.com/en_int/order/");
  const params = url.searchParams;
  params.set("pickup", preOrder.pointA);
  params.set("destination", preOrder.pointB);
  params.set("comment", `CRM fallback from B2B pre-order ${preOrder.orderId}`);
  params.set("scheduled_for", preOrder.scheduledFor);
  params.set("ride_class", "comfortplus");
  params.set("utm_source", "crm_b2c_handoff");
  return url.toString();
}

export function PreOrdersBoard({
  preOrders: initialPreOrders,
  errors: initialErrors,
  enableControllerLive = false,
}: PreOrdersBoardProps) {
  const { currentUser } = useAuth();
  const isClientScopedUser = currentUser?.accountType === "client";
  const canUseOnMap = !isClientScopedUser;
  const controllerMode = enableControllerLive && !isClientScopedUser;

  const [rows, setRows] = useState<PreOrder[]>(initialPreOrders);
  const [feedErrors, setFeedErrors] = useState<string[]>(initialErrors);
  const [fetchedAt, setFetchedAt] = useState<string | null>(
    enableControllerLive ? null : new Date().toISOString(),
  );
  const [isLive, setIsLive] = useState(false);
  const [isStale, setIsStale] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [removedNotice, setRemovedNotice] = useState<string | null>(null);

  const [selectedPreOrder, setSelectedPreOrder] = useState<PreOrder | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [handoffMessage, setHandoffMessage] = useState<string | null>(null);
  const [handoffPreOrder, setHandoffPreOrder] = useState<PreOrder | null>(null);
  const [markBusyKey, setMarkBusyKey] = useState<string | null>(null);

  useEffect(() => {
    if (!canUseOnMap && viewMode === "onMap") setViewMode("list");
  }, [canUseOnMap, viewMode]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), CLOCK_TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  const refreshLive = useCallback(async () => {
    if (!controllerMode) return;
    setIsRefreshing(true);
    try {
      const response = await fetch("/api/sales-operation/pre-orders/live", {
        method: "GET",
        cache: "no-store",
      });
      const data = (await response.json()) as {
        ok?: boolean;
        preOrders?: PreOrder[];
        errors?: string[];
        fetchedAt?: string;
        error?: string;
      };
      if (!response.ok || !data.ok || !Array.isArray(data.preOrders)) {
        setIsStale(true);
        if (data.error) {
          setFeedErrors((prev) => [...new Set([...prev, data.error!])]);
        }
        return;
      }

      setRows((prev) => {
        const nextIds = new Set(data.preOrders!.map((row) => row.id));
        const vanished = prev.filter((row) => !nextIds.has(row.id));
        if (vanished.length === 1) {
          setRemovedNotice(
            `Order ${vanished[0].orderId} left the live board (cancelled or completed).`,
          );
        } else if (vanished.length > 1) {
          setRemovedNotice(`${vanished.length} orders left the live board.`);
        }
        return data.preOrders!;
      });
      setFeedErrors(Array.isArray(data.errors) ? data.errors : []);
      setFetchedAt(data.fetchedAt ?? new Date().toISOString());
      setIsLive(true);
      setIsStale(false);
    } catch (error) {
      setIsStale(true);
      setFeedErrors((prev) => [
        ...new Set([...prev, error instanceof Error ? error.message : "Live refresh failed."]),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  }, [controllerMode]);

  useEffect(() => {
    if (!controllerMode) return;
    void refreshLive();
    const timer = window.setInterval(() => {
      void refreshLive();
    }, LIVE_POLL_MS);
    return () => window.clearInterval(timer);
  }, [controllerMode, refreshLive]);

  useEffect(() => {
    if (!removedNotice) return;
    const timer = window.setTimeout(() => setRemovedNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [removedNotice]);

  const activeRows = useMemo(() => {
    return rows
      .filter((row) => {
        if (!row.scheduledAt) return true;
        const due = new Date(row.scheduledAt).getTime();
        return Number.isFinite(due) ? due > nowMs : true;
      })
      .slice()
      .sort((a, b) => {
        const aTime = a.scheduledAt ? new Date(a.scheduledAt).getTime() : 0;
        const bTime = b.scheduledAt ? new Date(b.scheduledAt).getTime() : 0;
        return aTime - bTime;
      });
  }, [rows, nowMs]);

  useEffect(() => {
    setSelectedPreOrder((prev) => {
      if (!prev) return prev;
      if (!activeRows.some((row) => row.id === prev.id)) return null;
      return activeRows.find((row) => row.id === prev.id) ?? prev;
    });
  }, [activeRows]);

  const dateFilteredPreOrders = useMemo(() => {
    const now = new Date(nowMs);
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);
    const tomorrowStart = startOfDay(
      new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1),
    );
    const tomorrowEnd = endOfDay(
      new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1),
    );

    return activeRows.filter((preOrder) => {
      const scheduledDate = getScheduledDate(preOrder);
      if (!scheduledDate) return filterMode === "all";
      if (filterMode === "today") return scheduledDate >= todayStart && scheduledDate <= todayEnd;
      if (filterMode === "tomorrow") {
        return scheduledDate >= tomorrowStart && scheduledDate <= tomorrowEnd;
      }
      if (filterMode === "range") {
        const from = fromDate ? startOfDay(new Date(fromDate)) : null;
        const to = toDate ? endOfDay(new Date(toDate)) : null;
        if (from && Number.isNaN(from.getTime())) return true;
        if (to && Number.isNaN(to.getTime())) return true;
        if (from && scheduledDate < from) return false;
        if (to && scheduledDate > to) return false;
        return true;
      }
      return true;
    });
  }, [activeRows, filterMode, fromDate, toDate, nowMs]);

  const counters = useMemo(() => {
    let assigned = 0;
    let unassigned = 0;
    let atRisk = 0;
    for (const row of dateFilteredPreOrders) {
      const level = getPreOrderUrgencyLevel(row, nowMs);
      if (level === "green") assigned += 1;
      else unassigned += 1;
      if (level === "red" || level === "yellow") atRisk += 1;
    }
    return { live: dateFilteredPreOrders.length, assigned, unassigned, atRisk };
  }, [dateFilteredPreOrders, nowMs]);

  const filteredPreOrders = useMemo(() => {
    return dateFilteredPreOrders.filter((preOrder) => {
      if (statusFilter === "all") return true;
      const level = getPreOrderUrgencyLevel(preOrder, nowMs);
      if (statusFilter === "assigned") return level === "green";
      if (statusFilter === "unassigned") return level !== "green";
      if (statusFilter === "at_risk") return level === "red" || level === "yellow";
      return true;
    });
  }, [dateFilteredPreOrders, statusFilter, nowMs]);

  const copyToClipboard = async (fieldKey: string, value?: string | null) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(fieldKey);
      window.setTimeout(() => setCopiedField((prev) => (prev === fieldKey ? null : prev)), 1200);
    } catch {
      // ignore
    }
  };

  const cancelPreOrder = async (preOrder: PreOrder) => {
    if (
      !window.confirm(
        "Cancel this scheduled order in Yango? It will disappear from the corporate cabinet after a successful cancellation.",
      )
    ) {
      return;
    }
    setCancelError(null);
    setCancellingOrderId(preOrder.orderId);
    try {
      const response = await fetch("/api/yango-order-cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenLabel: preOrder.tokenLabel,
          clientId: preOrder.clientId,
          orderId: preOrder.orderId,
        }),
      });
      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "Failed to cancel order.");
      }
      setSelectedPreOrder(null);
      setHandoffPreOrder(null);
      await refreshLive();
    } catch (error) {
      setCancelError(error instanceof Error ? error.message : "Failed to cancel order.");
    } finally {
      setCancellingOrderId(null);
    }
  };

  const setContactStatus = async (
    preOrder: PreOrder,
    status: PreOrderOperatorContactStatus,
    event?: MouseEvent,
  ) => {
    if (!controllerMode) return;
    event?.stopPropagation();
    const key = `${preOrder.tokenLabel}:${preOrder.clientId}:${preOrder.orderId}`;
    setMarkBusyKey(key);
    setActionError(null);
    try {
      const response = await fetch("/api/sales-operation/pre-orders/marks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenLabel: preOrder.tokenLabel,
          clientId: preOrder.clientId,
          orderId: preOrder.orderId,
          status,
        }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        mark?: {
          status: PreOrderOperatorContactStatus;
          markedByUserId: string | null;
          markedByName: string | null;
          markedAt: string | null;
          note: string | null;
        };
        error?: string;
      };
      if (!response.ok || !data.ok || !data.mark) {
        throw new Error(data.error ?? "Failed to save contact mark.");
      }
      const contact =
        status === "none"
          ? null
          : {
              status: data.mark.status,
              markedByUserId: data.mark.markedByUserId,
              markedByName: data.mark.markedByName,
              markedAt: data.mark.markedAt,
              note: data.mark.note,
            };
      const patch = (row: PreOrder) =>
        row.tokenLabel === preOrder.tokenLabel &&
        row.clientId === preOrder.clientId &&
        row.orderId === preOrder.orderId
          ? { ...row, operatorContact: contact }
          : row;
      setRows((prev) => prev.map(patch));
      setSelectedPreOrder((prev) => (prev ? patch(prev) : prev));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to save mark.");
    } finally {
      setMarkBusyKey(null);
    }
  };

  const handoffTextForPreOrder = (preOrder: PreOrder) =>
    [
      `Order ID: ${preOrder.orderId}`,
      `Client: ${preOrder.clientName}`,
      `Scheduled for: ${preOrder.scheduledFor}`,
      `Pickup: ${preOrder.pointA}`,
      `Destination: ${preOrder.pointB}`,
      `Comment: CRM fallback from B2B pre-order ${preOrder.orderId}`,
    ].join("\n");

  return (
    <section className="crm-page">
      <div className="sticky top-0 z-20 mb-2 space-y-2 rounded-[12px] border border-[var(--so-border)] bg-[var(--so-surface)]/95 px-3 py-2.5 shadow-sm backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {controllerMode ? (
              <>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                    isStale
                      ? "border-amber-200 bg-amber-50 text-amber-800"
                      : "border-emerald-200 bg-emerald-50 text-emerald-800"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      isStale ? "bg-amber-500" : "animate-pulse bg-emerald-500"
                    }`}
                  />
                  {isStale ? "Stale" : isLive ? "Live" : "Connecting"}
                </span>
                <span className="text-xs tabular-nums text-muted">
                  Last updated:{" "}
                  <strong className="font-semibold text-slate-900">{formatClock(fetchedAt)}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => void refreshLive()}
                  disabled={isRefreshing}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                >
                  {isRefreshing ? "Refreshing…" : "Refresh now"}
                </button>
              </>
            ) : (
              <span className="text-xs font-semibold text-slate-700">Active pre-orders</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1 text-xs text-slate-600">
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className={cn(
                "rounded-[6px] px-2 py-1 transition-colors so-focus-ring",
                statusFilter === "all"
                  ? "bg-[var(--so-accent-soft)] text-[var(--so-accent-strong)]"
                  : "hover:bg-[var(--so-surface-hover)]",
              )}
              title="Show all"
            >
              {controllerMode ? "Live" : "Active"}{" "}
              <strong className="tabular-nums text-slate-900">{counters.live}</strong>
            </button>
            <span className="text-slate-300">·</span>
            <button
              type="button"
              onClick={() =>
                setStatusFilter((prev) => (prev === "assigned" ? "all" : "assigned"))
              }
              className={cn(
                "rounded-[6px] px-2 py-1 transition-colors so-focus-ring",
                statusFilter === "assigned"
                  ? "bg-emerald-50 text-emerald-800"
                  : "hover:bg-[var(--so-surface-hover)]",
              )}
              title="Show assigned only"
            >
              Assigned{" "}
              <strong className="tabular-nums text-slate-900">{counters.assigned}</strong>
            </button>
            <span className="text-slate-300">·</span>
            <button
              type="button"
              onClick={() =>
                setStatusFilter((prev) => (prev === "unassigned" ? "all" : "unassigned"))
              }
              className={cn(
                "rounded-[6px] px-2 py-1 transition-colors so-focus-ring",
                statusFilter === "unassigned"
                  ? "bg-[var(--so-accent-soft)] text-[var(--so-accent-strong)]"
                  : "hover:bg-[var(--so-surface-hover)]",
              )}
              title="Show unassigned only"
            >
              Unassigned{" "}
              <strong className="tabular-nums text-slate-900">{counters.unassigned}</strong>
            </button>
            <span className="text-slate-300">·</span>
            <button
              type="button"
              onClick={() =>
                setStatusFilter((prev) => (prev === "at_risk" ? "all" : "at_risk"))
              }
              className={cn(
                "rounded-[6px] px-2 py-1 transition-colors so-focus-ring",
                statusFilter === "at_risk"
                  ? "bg-rose-50 text-rose-800"
                  : "hover:bg-[var(--so-surface-hover)]",
              )}
              title="Show at risk only (red + yellow)"
            >
              At risk <strong className="tabular-nums text-rose-700">{counters.atRisk}</strong>
            </button>
          </div>
        </div>
      </div>

      {feedErrors.length > 0 ? (
        <div className="mb-0.5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-semibold">Some clients are unavailable</p>
          <p className="mt-1">{feedErrors.join(" | ")}</p>
        </div>
      ) : null}
      {cancelError ? (
        <div className="mb-0.5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <p className="font-semibold">Could not cancel order</p>
          <p className="mt-1">{cancelError}</p>
        </div>
      ) : null}
      {actionError ? (
        <div className="mb-0.5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-semibold">Action warning</p>
          <p className="mt-1">{actionError}</p>
        </div>
      ) : null}
      {handoffMessage ? (
        <div className="mb-0.5 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
          <p className="font-semibold">B2C handoff</p>
          <p className="mt-1">{handoffMessage}</p>
        </div>
      ) : null}
      {removedNotice ? (
        <div className="mb-0.5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700">
          {removedNotice}
        </div>
      ) : null}

      <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
        <nav
          className="flex items-center gap-0.5 border-b border-[var(--so-border)]"
          role="tablist"
          aria-label="Pre-orders view"
        >
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === "list"}
            className={cn(VIEW_TAB_BASE, viewMode === "list" ? VIEW_TAB_ACTIVE : VIEW_TAB_IDLE)}
            onClick={() => setViewMode("list")}
          >
            List
          </button>
          {canUseOnMap ? (
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === "onMap"}
              className={cn(
                VIEW_TAB_BASE,
                viewMode === "onMap" ? VIEW_TAB_ACTIVE : VIEW_TAB_IDLE,
              )}
              onClick={() => setViewMode("onMap")}
            >
              On map
            </button>
          ) : null}
        </nav>
      </div>

      <FilterBar className="mb-2">
        <FilterChip active={filterMode === "all"} onClick={() => setFilterMode("all")}>
          All dates
        </FilterChip>
        <FilterChip active={filterMode === "today"} onClick={() => setFilterMode("today")}>
          Today
        </FilterChip>
        <FilterChip active={filterMode === "tomorrow"} onClick={() => setFilterMode("tomorrow")}>
          Tomorrow
        </FilterChip>
        <FilterChip active={filterMode === "range"} onClick={() => setFilterMode("range")}>
          Range
        </FilterChip>
        {filterMode === "range" ? (
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
              className="crm-input h-9 rounded-lg border-slate-200 bg-white px-2 text-sm"
            />
            <input
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
              className="crm-input h-9 rounded-lg border-slate-200 bg-white px-2 text-sm"
            />
          </div>
        ) : null}
        <span className="mx-1 h-4 w-px bg-[var(--so-border)]" aria-hidden />
        <FilterChip
          active={statusFilter === "all"}
          onClick={() => setStatusFilter("all")}
        >
          All status
        </FilterChip>
        <FilterChip
          active={statusFilter === "assigned"}
          onClick={() => setStatusFilter("assigned")}
        >
          Assigned
        </FilterChip>
        <FilterChip
          active={statusFilter === "unassigned"}
          onClick={() => setStatusFilter("unassigned")}
        >
          Unassigned
        </FilterChip>
        <FilterChip
          active={statusFilter === "at_risk"}
          onClick={() => setStatusFilter("at_risk")}
          className={
            statusFilter === "at_risk"
              ? "border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-50"
              : undefined
          }
        >
          At risk
        </FilterChip>
      </FilterBar>

      {viewMode === "onMap" && canUseOnMap ? (
        <PreOrdersMapView
          preOrders={filteredPreOrders}
          onOpenFull={(preOrder) => setSelectedPreOrder(preOrder)}
        />
      ) : filteredPreOrders.length === 0 ? (
        <div className="so-card rounded-[12px] px-4 py-10 text-center text-sm text-muted">
          No active pre-orders for the current filters.
        </div>
      ) : (
        <section className="so-card mt-0.5 overflow-hidden rounded-[12px]">
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-y-2">
              <thead className="bg-[#f6f6f8]">
                <tr>
                  <th className="px-3 py-2.5 text-center text-xs font-medium text-muted">
                    Pre-order
                  </th>
                  {!isClientScopedUser ? (
                    <th className="px-3 py-2.5 text-center text-xs font-medium text-muted">
                      Client
                    </th>
                  ) : null}
                  <th className="px-3 py-2.5 text-center text-xs font-medium text-muted">Status</th>
                  <th className="px-3 py-2.5 text-center text-xs font-medium text-muted">Driver</th>
                  {controllerMode ? (
                    <th className="px-3 py-2.5 text-center text-xs font-medium text-muted">Contact</th>
                  ) : null}
                  <th className="px-3 py-2.5 text-center text-xs font-medium text-muted">
                    Scheduled for
                  </th>
                  <th className="px-3 py-2.5 text-center text-xs font-medium text-muted">Route</th>
                  <th className="px-3 py-2.5 text-center text-xs font-medium text-muted">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredPreOrders.map((preOrder) => {
                  const assigned = isPreOrderDriverAssigned(preOrder);
                  const urgency = getPreOrderUrgencyLevel(preOrder, nowMs);
                  const minutes = minutesUntilScheduled(preOrder.scheduledAt, nowMs);
                  const driverName = formatDriverDisplayName(preOrder);
                  const contact = preOrder.operatorContact;
                  const busyKey = `${preOrder.tokenLabel}:${preOrder.clientId}:${preOrder.orderId}`;
                  return (
                    <tr
                      key={preOrder.id}
                      title={getPreOrderUrgencyLabel(urgency, minutes)}
                      className={`group cursor-pointer transition-colors duration-150 ${preOrderUrgencyTintClass(urgency)} hover:[&>td]:bg-[var(--so-surface-hover)]`}
                      onClick={() => setSelectedPreOrder(preOrder)}
                    >
                      <td
                        className={`rounded-l-xl border border-transparent px-3 py-2.5 text-center text-sm font-medium text-slate-900 ${preOrderUrgencyRailClass(urgency)}`}
                      >
                        {preOrder.orderId}
                      </td>
                      {!isClientScopedUser ? (
                        <td className="border border-transparent px-3 py-2.5 text-center text-sm text-slate-700">
                          {preOrder.clientName}
                        </td>
                      ) : null}
                      <td className="border border-transparent px-3 py-2.5 text-center text-sm">
                        <span
                          className={`inline-flex rounded-md border px-2.5 py-1 text-xs font-medium ${
                            assigned
                              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                              : "border-rose-200 bg-rose-50 text-rose-800"
                          }`}
                        >
                          {assigned ? "Assigned" : "Unassigned"}
                        </span>
                      </td>
                      <td className="border border-transparent px-3 py-2.5 text-center text-sm text-slate-700">
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="font-medium text-slate-900">{driverName}</span>
                          {preOrder.driverPhone ? (
                            <a
                              href={`tel:${preOrder.driverPhone}`}
                              onClick={(event) => event.stopPropagation()}
                              className="text-xs text-sky-700 hover:underline"
                            >
                              {preOrder.driverPhone}
                            </a>
                          ) : null}
                          {preOrder.driverId ? (
                            <span className="text-[10px] text-muted">ID {preOrder.driverId}</span>
                          ) : null}
                          {preOrder.driverCarModel || preOrder.driverCarPlate ? (
                            <span className="text-[10px] text-muted">
                              {[preOrder.driverCarModel, preOrder.driverCarPlate]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      {controllerMode ? (
                        <td className="border border-transparent px-3 py-2.5 text-center text-sm">
                          <div
                            className="relative inline-flex"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <details>
                              <summary
                                className={`list-none inline-flex cursor-pointer rounded-md border px-2.5 py-1 text-[11px] font-semibold ${contactChipClass(contact?.status)}`}
                              >
                                {markBusyKey === busyKey
                                  ? "Saving…"
                                  : contactLabel(contact?.status)}
                              </summary>
                              <div className="absolute left-1/2 z-30 mt-1 w-44 -translate-x-1/2 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
                                {CONTACT_OPTIONS.map((option) => (
                                  <button
                                    key={option.value}
                                    type="button"
                                    className="block w-full rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-50"
                                    onClick={(event) =>
                                      void setContactStatus(preOrder, option.value, event)
                                    }
                                  >
                                    {option.label}
                                  </button>
                                ))}
                                {contact?.markedByName && contact.markedAt ? (
                                  <p className="border-t border-slate-100 px-2.5 py-1.5 text-[10px] text-muted">
                                    {contact.markedByName} · {formatClock(contact.markedAt)}
                                  </p>
                                ) : null}
                              </div>
                            </details>
                          </div>
                        </td>
                      ) : null}
                      <td className="border border-transparent px-3 py-2.5 text-center text-sm text-slate-700">
                        {preOrder.scheduledFor}
                      </td>
                      <td className="border border-transparent px-3 py-2.5 text-center text-sm text-slate-700">
                        <div
                          className="mx-auto max-w-[220px] truncate"
                          title={`${preOrder.pointA} → ${preOrder.pointB}`}
                        >
                          {preOrder.pointA} → {preOrder.pointB}
                        </div>
                      </td>
                      <td className="rounded-r-xl border border-transparent px-3 py-2.5 text-center text-sm">
                        <button
                          type="button"
                          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedPreOrder(preOrder);
                          }}
                        >
                          Open
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {selectedPreOrder ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 px-4 py-6 backdrop-blur-sm"
          onClick={() => setSelectedPreOrder(null)}
        >
          <div
            className="crm-modal-surface max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-[16px] p-4"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  Pre-order {selectedPreOrder.orderId}
                </h3>
                <p className="text-sm text-muted">{selectedPreOrder.clientName}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPreOrder(null)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-lg font-semibold text-slate-700"
              >
                ×
              </button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
                <p className="text-xs text-muted">Pickup</p>
                <p className="mt-1 font-medium text-slate-900">{selectedPreOrder.pointA}</p>
                <p className="mt-3 text-xs text-muted">Destination</p>
                <p className="mt-1 font-medium text-slate-900">{selectedPreOrder.pointB}</p>
                <p className="mt-3 text-xs text-muted">Scheduled for</p>
                <p className="mt-1 font-medium text-slate-900">{selectedPreOrder.scheduledFor}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
                <p className="text-xs text-muted">Driver</p>
                <p className="mt-1 font-medium text-slate-900">
                  {formatDriverDisplayName(selectedPreOrder)}
                </p>
                <p className="mt-2 text-xs text-muted">Phone</p>
                <p className="mt-1 font-medium text-slate-900">
                  {selectedPreOrder.driverPhone ?? "—"}
                  {selectedPreOrder.driverPhone ? (
                    <button
                      type="button"
                      className="ml-2 text-xs text-sky-700"
                      onClick={() =>
                        void copyToClipboard("driverPhone", selectedPreOrder.driverPhone)
                      }
                    >
                      {copiedField === "driverPhone" ? "Copied" : "Copy"}
                    </button>
                  ) : null}
                </p>
                <p className="mt-2 text-xs text-muted">Driver ID</p>
                <p className="mt-1 font-medium text-slate-900">
                  {selectedPreOrder.driverId ?? "—"}
                </p>
                <p className="mt-2 text-xs text-muted">Vehicle</p>
                <p className="mt-1 font-medium text-slate-900">
                  {[selectedPreOrder.driverCarModel, selectedPreOrder.driverCarPlate]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </p>
                {controllerMode ? (
                  <>
                    <p className="mt-2 text-xs text-muted">Contact</p>
                    <p className="mt-1 font-medium text-slate-900">
                      {contactLabel(selectedPreOrder.operatorContact?.status)}
                      {selectedPreOrder.operatorContact?.markedByName
                        ? ` · ${selectedPreOrder.operatorContact.markedByName}`
                        : ""}
                      {selectedPreOrder.operatorContact?.markedAt
                        ? ` · ${formatClock(selectedPreOrder.operatorContact.markedAt)}`
                        : ""}
                    </p>
                  </>
                ) : null}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={cancellingOrderId === selectedPreOrder.orderId}
                onClick={() => void cancelPreOrder(selectedPreOrder)}
                className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800 hover:bg-rose-100 disabled:opacity-60"
              >
                {cancellingOrderId === selectedPreOrder.orderId
                  ? "Cancelling…"
                  : "Cancel order in Yango"}
              </button>
              {!isClientScopedUser ? (
                <button
                  type="button"
                  onClick={() => {
                    setHandoffPreOrder(selectedPreOrder);
                    setHandoffMessage(null);
                  }}
                  className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-800 hover:bg-sky-100"
                >
                  Open in Yango B2C
                </button>
              ) : null}
              {controllerMode
                ? CONTACT_OPTIONS.filter((option) => option.value !== "none").map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => void setContactStatus(selectedPreOrder, option.value)}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      {option.label}
                    </button>
                  ))
                : null}
            </div>
          </div>
        </div>
      ) : null}

      {handoffPreOrder && !isClientScopedUser ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/45 px-4 py-6 backdrop-blur-sm"
          onClick={() => setHandoffPreOrder(null)}
        >
          <div
            className="crm-modal-surface w-full max-w-3xl rounded-[16px] p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-slate-900">Yango B2C handoff</h3>
            <p className="mt-2 text-sm text-slate-600">
              Open Yango in a new tab and paste route details if the form did not auto-fill.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <a
                href={buildYangoB2CHandoffUrl(handoffPreOrder)}
                target="_blank"
                rel="noreferrer"
                className="crm-button-primary rounded-xl px-3 py-2 text-sm font-semibold"
              >
                Open Yango order page
              </a>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(handoffTextForPreOrder(handoffPreOrder));
                    setHandoffMessage("Ride details copied to clipboard.");
                  } catch {
                    setHandoffMessage("Could not copy automatically.");
                  }
                }}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
              >
                Copy full details
              </button>
              <button
                type="button"
                onClick={() => setHandoffPreOrder(null)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
