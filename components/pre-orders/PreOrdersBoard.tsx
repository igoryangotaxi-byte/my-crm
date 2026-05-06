"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  segmentedTabInactiveClass,
  segmentedTabSelectedClass,
  segmentedTabTrackClass,
} from "@/components/crm/segmented-tab-classes";
import { PreOrdersMapView } from "@/components/pre-orders/PreOrdersMapView";
import type { PreOrder } from "@/types/crm";

type PreOrdersBoardProps = {
  preOrders: PreOrder[];
  errors: string[];
};

type FilterMode = "all" | "today" | "tomorrow" | "range";
type ViewMode = "list" | "onMap";

function IconCalendar({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

function getScheduledDate(preOrder: PreOrder) {
  if (!preOrder.scheduledAt) {
    return null;
  }

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

function isDriverAssigned(preOrder: PreOrder) {
  const status = preOrder.orderStatus?.toLowerCase() ?? "";
  const assignedStatuses = new Set([
    "driving",
    "transporting",
    "waiting",
    "pickup",
    "assigned",
  ]);

  return preOrder.driverAssigned || assignedStatuses.has(status);
}

function buildYangoB2CHandoffUrl(preOrder: PreOrder) {
  const baseUrl = new URL("https://yango.com/en_int/order/");
  const comment = `CRM fallback from B2B pre-order ${preOrder.orderId}`;
  const params = baseUrl.searchParams;
  // Best-effort aliases because Yango web can read different keys in different locales/versions.
  params.set("pickup", preOrder.pointA);
  params.set("from", preOrder.pointA);
  params.set("source", preOrder.pointA);
  params.set("destination", preOrder.pointB);
  params.set("to", preOrder.pointB);
  params.set("dropoff", preOrder.pointB);
  params.set("comment", comment);
  params.set("notes", comment);
  params.set("scheduled_for", preOrder.scheduledFor);
  params.set("when", preOrder.scheduledFor);
  params.set("ride_class", "comfortplus");
  params.set("class", "comfortplus");
  params.set("utm_source", "crm_b2c_handoff");
  return baseUrl.toString();
}

export function PreOrdersBoard({ preOrders, errors }: PreOrdersBoardProps) {
  const tPreOrders = useTranslations("preOrdersPage");
  const { currentUser } = useAuth();
  const isClientScopedUser = currentUser?.accountType === "client";
  const canUseOnMap = !isClientScopedUser;
  const router = useRouter();
  const [selectedPreOrder, setSelectedPreOrder] = useState<PreOrder | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [fallbackActionError, setFallbackActionError] = useState<string | null>(null);
  const [handoffMessage, setHandoffMessage] = useState<string | null>(null);
  const [handoffPreOrder, setHandoffPreOrder] = useState<PreOrder | null>(null);
  const [handoffOpenedOrderId, setHandoffOpenedOrderId] = useState<string | null>(null);

  useEffect(() => {
    if (!canUseOnMap && viewMode === "onMap") {
      setViewMode("list");
    }
  }, [canUseOnMap, viewMode]);

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
      setHandoffOpenedOrderId(null);
      router.refresh();
    } catch (error) {
      setCancelError(error instanceof Error ? error.message : "Failed to cancel order.");
    } finally {
      setCancellingOrderId(null);
    }
  };

  const getDriverFallbackText = (preOrder: PreOrder) =>
    preOrder.orderStatus === "scheduling"
      ? "Not provided by API yet"
      : "Not assigned";

  const handoffTextForPreOrder = (preOrder: PreOrder) =>
    [
      `Order ID: ${preOrder.orderId}`,
      `Client: ${preOrder.clientName}`,
      `Scheduled for: ${preOrder.scheduledFor}`,
      `Pickup: ${preOrder.pointA}`,
      `Destination: ${preOrder.pointB}`,
      `Comment: CRM fallback from B2B pre-order ${preOrder.orderId}`,
    ].join("\n");

  const openB2CWebOrder = async (preOrder: PreOrder) => {
    setFallbackActionError(null);
    setHandoffMessage(null);
    setHandoffPreOrder(preOrder);
    setHandoffOpenedOrderId(null);
  };

  const openYangoOrderPageFromHandoff = (preOrder: PreOrder) => {
    window.open(buildYangoB2CHandoffUrl(preOrder), "_blank", "noopener,noreferrer");
    setHandoffOpenedOrderId(preOrder.orderId);
  };

  const copyHandoffDetails = async (preOrder: PreOrder) => {
    try {
      await navigator.clipboard.writeText(handoffTextForPreOrder(preOrder));
      setHandoffMessage("Ride details copied to clipboard.");
    } catch {
      setHandoffMessage("Could not copy automatically. Copy route details manually from the modal.");
    }
  };

  const fallbackPillClass =
    "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_4px_10px_rgba(15,23,42,0.08)]";

  const fallbackStatusBadge = (preOrder: PreOrder) => {
    const status = preOrder.fallback?.status;
    if (!status || status === "idle") return null;
    if (status === "completed") {
      return (
        <span
          className={`${fallbackPillClass} border-sky-200/90 bg-[linear-gradient(180deg,#e0f2fe_0%,#7dd3fc_100%)] text-sky-900`}
        >
          Fallback to B2C
        </span>
      );
    }
    if (status === "failed") {
      return (
        <span
          className={`${fallbackPillClass} border-amber-200/90 bg-[linear-gradient(180deg,#fffbeb_0%,#fcd34d_100%)] text-amber-900`}
        >
          Fallback failed
        </span>
      );
    }
    if (status === "in_progress") {
      return (
        <span
          className={`${fallbackPillClass} border-slate-200/90 bg-[linear-gradient(180deg,#f8fafc_0%,#cbd5e1_100%)] text-slate-800`}
        >
          Fallback running
        </span>
      );
    }
    return (
      <span
        className={`${fallbackPillClass} border-slate-200/90 bg-[linear-gradient(180deg,#f8fafc_0%,#e2e8f0_100%)] text-slate-800`}
      >
        Fallback skipped
      </span>
    );
  };

  const copyToClipboard = async (fieldKey: string, value?: string | null) => {
    if (!value) {
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(fieldKey);
      setTimeout(() => setCopiedField((prev) => (prev === fieldKey ? null : prev)), 1200);
    } catch {
      // Silently ignore clipboard errors to keep UI simple.
    }
  };

  const filteredPreOrders = useMemo(() => {
    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);
    const tomorrowStart = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
    const tomorrowEnd = endOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));

    return preOrders.filter((preOrder) => {
      const scheduledDate = getScheduledDate(preOrder);
      if (!scheduledDate) {
        return filterMode === "all";
      }

      if (filterMode === "today") {
        return scheduledDate >= todayStart && scheduledDate <= todayEnd;
      }

      if (filterMode === "tomorrow") {
        return scheduledDate >= tomorrowStart && scheduledDate <= tomorrowEnd;
      }

      if (filterMode === "range") {
        const from = fromDate ? startOfDay(new Date(fromDate)) : null;
        const to = toDate ? endOfDay(new Date(toDate)) : null;

        if (from && Number.isNaN(from.getTime())) {
          return true;
        }

        if (to && Number.isNaN(to.getTime())) {
          return true;
        }

        if (from && scheduledDate < from) {
          return false;
        }

        if (to && scheduledDate > to) {
          return false;
        }

        return true;
      }

      return true;
    });
  }, [preOrders, filterMode, fromDate, toDate]);
  const preOrdersCounts = useMemo(() => {
    const assigned = filteredPreOrders.filter((item) => isDriverAssigned(item)).length;
    return {
      assigned,
      unassigned: filteredPreOrders.length - assigned,
    };
  }, [filteredPreOrders]);

  return (
    <section className="crm-page">
      {errors.length > 0 ? (
        <div className="mb-0.5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-semibold">Some clients are unavailable</p>
          <p className="mt-1">{errors.join(" | ")}</p>
        </div>
      ) : null}

      {cancelError ? (
        <div className="mb-0.5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <p className="font-semibold">Could not cancel order</p>
          <p className="mt-1">{cancelError}</p>
        </div>
      ) : null}
      {fallbackActionError ? (
        <div className="mb-0.5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-semibold">Fallback warning</p>
          <p className="mt-1">{fallbackActionError}</p>
        </div>
      ) : null}
      {handoffMessage ? (
        <div className="mb-0.5 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
          <p className="font-semibold">B2C handoff</p>
          <p className="mt-1">{handoffMessage}</p>
        </div>
      ) : null}

      <div className={segmentedTabTrackClass}>
          <button
            type="button"
            onClick={() => setViewMode("list")}
            className={`flex-1 rounded-xl px-2 py-2.5 text-xs font-semibold sm:px-3 sm:text-sm ${
              viewMode === "list"
                ? segmentedTabSelectedClass
                : segmentedTabInactiveClass
            }`}
          >
            {tPreOrders("tabList")}
          </button>
        {canUseOnMap ? (
          <button
            type="button"
            onClick={() => setViewMode("onMap")}
            className={`flex-1 rounded-xl px-2 py-2.5 text-xs font-semibold sm:px-3 sm:text-sm ${
              viewMode === "onMap"
                ? segmentedTabSelectedClass
                : segmentedTabInactiveClass
            }`}
          >
            {tPreOrders("tabOnMap")}
          </button>
        ) : null}
      </div>

      {viewMode === "list" ? (
        <div className="mb-0.5 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
          <div className="flex w-full min-w-0 flex-col gap-2 lg:flex-row lg:items-center lg:justify-between lg:gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {([
                { mode: "all", label: "All" },
                { mode: "today", label: "Today" },
                { mode: "tomorrow", label: "Tomorrow" },
                { mode: "range", label: "Date range" },
              ] as const).map((item) => (
                <button
                  key={item.mode}
                  type="button"
                  onClick={() => setFilterMode(item.mode)}
                  className={`inline-flex h-9 shrink-0 items-center justify-center rounded-lg border px-3 text-sm font-medium transition ${
                    filterMode === item.mode
                      ? "crm-button-primary border-transparent text-white shadow-sm"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-2 lg:w-auto lg:flex-1 lg:justify-center">
              <div className="relative min-w-0 flex-1 sm:max-w-[11rem]">
                <IconCalendar className="pointer-events-none absolute left-2.5 top-1/2 z-[1] h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="date"
                  value={fromDate}
                  aria-label="From date"
                  onChange={(event) => {
                    setFilterMode("range");
                    setFromDate(event.target.value);
                  }}
                  className="crm-input h-9 w-full min-w-0 rounded-lg border-slate-200 bg-white pl-9 pr-2 text-sm text-slate-800"
                />
              </div>
              <div className="relative min-w-0 flex-1 sm:max-w-[11rem]">
                <IconCalendar className="pointer-events-none absolute left-2.5 top-1/2 z-[1] h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="date"
                  value={toDate}
                  aria-label="To date"
                  onChange={(event) => {
                    setFilterMode("range");
                    setToDate(event.target.value);
                  }}
                  className="crm-input h-9 w-full min-w-0 rounded-lg border-slate-200 bg-white pl-9 pr-2 text-sm text-slate-800"
                />
              </div>
            </div>

            <div
              className="inline-flex h-9 w-full min-w-0 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-600 lg:w-auto lg:shrink-0 lg:justify-end"
              title="Assignment counts for the current filter"
            >
              <span className="flex -space-x-1 pr-0.5" aria-hidden>
                <span className="relative z-10 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-white" />
                <span className="relative z-[2] h-2 w-2 rounded-full bg-amber-400 ring-2 ring-white" />
                <span className="relative z-[3] h-2 w-2 rounded-full bg-slate-400 ring-2 ring-white" />
              </span>
              <span className="whitespace-nowrap">
                Assigned{" "}
                <strong className="tabular-nums font-semibold text-slate-900">{preOrdersCounts.assigned}</strong>
              </span>
              <span className="text-slate-300">·</span>
              <span className="whitespace-nowrap">
                Unassigned{" "}
                <strong className="tabular-nums font-semibold text-slate-900">{preOrdersCounts.unassigned}</strong>
              </span>
            </div>
          </div>
        </div>
      ) : null}

      {viewMode === "onMap" && canUseOnMap ? (
        <PreOrdersMapView
          preOrders={filteredPreOrders}
          onOpenFull={(preOrder) => setSelectedPreOrder(preOrder)}
        />
      ) : filteredPreOrders.length === 0 ? (
        <div className="glass-surface rounded-3xl px-4 py-10 text-center text-sm text-muted">
          No pre-orders found for selected filter.
        </div>
      ) : (
        <section className="glass-surface mt-0.5 overflow-hidden rounded-3xl">
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-y-2">
              <thead className="bg-[#f6f6f8]">
                <tr>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-muted">
                    Pre-order
                  </th>
                  {!isClientScopedUser ? (
                    <th className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-muted">
                      Client
                    </th>
                  ) : null}
                  <th className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-muted">
                    Status
                  </th>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-muted">
                    Scheduled for
                  </th>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-muted">
                    Route
                  </th>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-muted">
                    Adminka
                  </th>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-muted">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredPreOrders.map((preOrder) => {
                  const assigned = isDriverAssigned(preOrder);
                  const rowTint = assigned ? "[&>td]:bg-emerald-50/45" : "[&>td]:bg-rose-50/45";
                  return (
                    <tr
                      key={preOrder.id}
                      className={`group cursor-pointer transition-all duration-200 ease-out hover:-translate-y-0.5 hover:drop-shadow-[0_14px_36px_rgba(15,23,42,0.14)] ${rowTint} hover:[&>td]:bg-white/95`}
                      onClick={() => setSelectedPreOrder(preOrder)}
                    >
                      <td className="rounded-l-xl border border-transparent px-3 py-2.5 text-center text-sm font-medium text-slate-900 transition-colors duration-200">
                        {preOrder.orderId}
                      </td>
                      {!isClientScopedUser ? (
                        <td className="border border-transparent px-3 py-2.5 text-center text-sm text-slate-700 transition-colors duration-200">
                          {preOrder.clientName}
                        </td>
                      ) : null}
                      <td className="border border-transparent px-3 py-2.5 text-center text-sm transition-colors duration-200">
                        <div className="flex flex-wrap items-center justify-center gap-1.5">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.88),0_5px_14px_rgba(15,23,42,0.1)] ${
                              assigned
                                ? "border-emerald-200/90 bg-[linear-gradient(180deg,#ecfdf5_0%,#a7f3d0_55%,#6ee7b7_100%)] text-emerald-900"
                                : "border-rose-200/90 bg-[linear-gradient(180deg,#fff1f2_0%,#fecdd3_55%,#fda4af_100%)] text-rose-900"
                            }`}
                          >
                            {assigned ? "Assigned" : "Unassigned"}
                          </span>
                          {fallbackStatusBadge(preOrder)}
                        </div>
                      </td>
                      <td className="border border-transparent px-3 py-2.5 text-center text-sm text-slate-700 transition-colors duration-200">
                        {preOrder.scheduledFor}
                      </td>
                      <td className="border border-transparent px-3 py-2.5 text-center text-sm text-slate-700 transition-colors duration-200">
                        <span className="mx-auto block max-w-[22rem] truncate">
                          {preOrder.pointA} {"->"} {preOrder.pointB}
                        </span>
                      </td>
                      <td className="border border-transparent px-3 py-2.5 text-center text-sm transition-colors duration-200">
                        <Link
                          href={`https://go-admin-frontend.taxi.yandex-team.ru/orders/${preOrder.orderId}`}
                          className="inline-flex items-center rounded-lg border border-slate-200 bg-white/85 px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-white"
                          onClick={(event) => event.stopPropagation()}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Order in Adminka
                        </Link>
                      </td>
                      <td className="rounded-r-xl border border-transparent px-3 py-2.5 text-center text-sm transition-colors duration-200">
                        <div className="flex flex-wrap items-center justify-center gap-1.5">
                          <button
                            type="button"
                            disabled={cancellingOrderId === preOrder.orderId}
                            onClick={(event) => {
                              event.stopPropagation();
                              void cancelPreOrder(preOrder);
                            }}
                            className="inline-flex items-center rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {cancellingOrderId === preOrder.orderId ? "Cancelling…" : "Cancel in Yango"}
                          </button>
                          {!isClientScopedUser ? (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                void openB2CWebOrder(preOrder);
                              }}
                              className="inline-flex items-center rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Open in Yango B2C
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredPreOrders.length === 0 ? (
                  <tr>
                    <td
                      colSpan={isClientScopedUser ? 6 : 7}
                      className="px-3 py-8 text-center text-sm text-muted"
                    >
                      No pre-orders for selected filters.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {selectedPreOrder ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-8 backdrop-blur-sm"
          onClick={() => setSelectedPreOrder(null)}
        >
          <div
            className="crm-modal-surface w-full max-w-3xl rounded-3xl p-3 lg:p-4"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3 px-1">
              <h3 className="text-xl font-semibold text-foreground">
                Order at {selectedPreOrder.scheduledFor}
              </h3>
              <button
                type="button"
                onClick={() => setSelectedPreOrder(null)}
                className="crm-hover-lift inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/80 text-lg font-semibold leading-none text-slate-700"
                aria-label="Close modal"
              >
                ×
              </button>
            </div>

            <div className="grid gap-3 lg:grid-cols-[1.2fr_1fr]">
              <section className="space-y-4">
                <div className="overflow-hidden rounded-3xl border border-slate-200 bg-[#f7f8fa]">
                  <div className="h-44 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.9),rgba(226,232,240,0.6)),linear-gradient(135deg,#e2e8f0,#f8fafc)] p-3">
                    <div className="grid h-full grid-rows-2 gap-4">
                      <div className="rounded-2xl border border-slate-200 bg-white/80 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                          Pickup
                        </p>
                        <p className="mt-2 text-sm font-medium text-slate-900">
                          {selectedPreOrder.pointA}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white/80 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                          Destination
                        </p>
                        <p className="mt-2 text-sm font-medium text-slate-900">
                          {selectedPreOrder.pointB}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-[#f8f9fb] p-4">
                  <h4 className="mb-3 text-xl font-semibold text-slate-900">Route</h4>
                  <dl className="space-y-3 text-sm">
                    <div className="rounded-xl bg-white px-3 py-2.5">
                      <dt className="text-muted">Client</dt>
                      <dd className="font-medium text-slate-900">{selectedPreOrder.clientName}</dd>
                    </div>
                    <div className="rounded-xl bg-white px-3 py-2.5">
                      <dt className="text-muted">Scheduled for</dt>
                      <dd className="font-medium text-slate-900">
                        {selectedPreOrder.scheduledFor}
                      </dd>
                    </div>
                    <div className="rounded-xl bg-white px-3 py-2.5">
                      <dt className="text-muted">Created at</dt>
                      <dd className="font-medium text-slate-900">
                        {selectedPreOrder.requestedAt}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                      Driver details
                    </p>
                    <dl className="mt-2 space-y-2.5 text-sm">
                      <div>
                        <dt className="text-muted">Driver ID</dt>
                        <dd className="flex items-center gap-2 font-medium text-slate-900">
                          <span>
                            {selectedPreOrder.driverId ?? getDriverFallbackText(selectedPreOrder)}
                          </span>
                          {selectedPreOrder.driverId ? (
                            <button
                              type="button"
                              onClick={() =>
                                copyToClipboard("driverId", selectedPreOrder.driverId)
                              }
                              className="rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-200"
                            >
                              {copiedField === "driverId" ? "Copied" : "Copy"}
                            </button>
                          ) : null}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted">Driver phone</dt>
                        <dd className="flex items-center gap-2 font-medium text-slate-900">
                          <span>
                            {selectedPreOrder.driverPhone ??
                              getDriverFallbackText(selectedPreOrder)}
                          </span>
                          {selectedPreOrder.driverPhone ? (
                            <button
                              type="button"
                              onClick={() =>
                                copyToClipboard("driverPhone", selectedPreOrder.driverPhone)
                              }
                              className="rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-200"
                            >
                              {copiedField === "driverPhone" ? "Copied" : "Copy"}
                            </button>
                          ) : null}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted">Driver name</dt>
                        <dd className="font-medium text-slate-900">
                          {selectedPreOrder.driverFirstName && selectedPreOrder.driverLastName
                            ? `${selectedPreOrder.driverFirstName} ${selectedPreOrder.driverLastName}`
                            : getDriverFallbackText(selectedPreOrder)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted">Driver assignment status</dt>
                        <dd className="font-medium text-slate-900">
                          {isDriverAssigned(selectedPreOrder)
                            ? "Assigned"
                            : getDriverFallbackText(selectedPreOrder)}
                        </dd>
                      </div>
                      {selectedPreOrder.fallback?.status &&
                      selectedPreOrder.fallback.status !== "idle" ? (
                        <div>
                          <dt className="text-muted">Fallback status</dt>
                          <dd className="font-medium text-slate-900">
                            {selectedPreOrder.fallback.status}
                            {selectedPreOrder.fallback.fallbackOrderId
                              ? ` -> ${selectedPreOrder.fallback.fallbackOrderId}`
                              : ""}
                            {selectedPreOrder.fallback.reason
                              ? ` (${selectedPreOrder.fallback.reason})`
                              : ""}
                          </dd>
                        </div>
                      ) : null}
                    </dl>
                  </div>
                </div>
              </section>

              <aside className="rounded-3xl border border-slate-200 bg-[#f8f9fb] p-4">
                <h4 className="mb-4 text-2xl font-semibold text-slate-900">Details</h4>
                <dl className="space-y-4 text-sm">
                  <div>
                    <dt className="text-muted">Ride type</dt>
                    <dd className="font-medium text-slate-900">Regular request</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Service class</dt>
                    <dd className="font-medium text-slate-900">Estimated price</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Pickup time</dt>
                    <dd className="font-medium text-slate-900">
                      {selectedPreOrder.scheduledFor}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Request creation date</dt>
                    <dd className="font-medium text-slate-900">
                      {selectedPreOrder.requestedAt}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">User</dt>
                    <dd className="font-medium text-slate-900">{selectedPreOrder.clientName}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Price for client</dt>
                    <dd className="font-semibold text-slate-900">{selectedPreOrder.clientPrice}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Order ID</dt>
                    <dd className="font-medium text-slate-900">
                      <button
                        type="button"
                        onClick={() =>
                          copyToClipboard("orderId", selectedPreOrder.orderId)
                        }
                        className="relative inline-flex cursor-copy items-center rounded-lg bg-white px-2.5 py-1 transition hover:bg-slate-100"
                      >
                        <span>{selectedPreOrder.orderId}</span>
                        {copiedField === "orderId" ? (
                          <span className="absolute -top-7 left-1/2 -translate-x-1/2 rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-semibold text-white">
                            Copied
                          </span>
                        ) : null}
                      </button>
                    </dd>
                  </div>
                </dl>

                <button
                  type="button"
                  disabled={cancellingOrderId === selectedPreOrder.orderId}
                  onClick={() => void cancelPreOrder(selectedPreOrder)}
                  className="mt-5 w-full rounded-xl border border-rose-200 bg-rose-50 py-2.5 text-sm font-semibold text-rose-800 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {cancellingOrderId === selectedPreOrder.orderId
                    ? "Cancelling in Yango…"
                    : "Cancel order in Yango"}
                </button>
                {!isClientScopedUser ? (
                  <button
                    type="button"
                    onClick={() => void openB2CWebOrder(selectedPreOrder)}
                    className="mt-2 w-full rounded-xl border border-sky-200 bg-sky-50 py-2.5 text-sm font-semibold text-sky-800 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Open in Yango B2C
                  </button>
                ) : null}
              </aside>
            </div>
          </div>
        </div>
      ) : null}
      {handoffPreOrder && !isClientScopedUser ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/45 px-4 py-6 backdrop-blur-sm"
          onClick={() => {
            setHandoffPreOrder(null);
            setHandoffOpenedOrderId(null);
          }}
        >
          <div
            className="crm-modal-surface grid h-[86vh] w-full max-w-7xl gap-3 rounded-3xl p-3 lg:grid-cols-[1.7fr_0.9fr]"
            onClick={(event) => event.stopPropagation()}
          >
            <section className="flex min-h-[420px] flex-col justify-center rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="text-lg font-semibold text-slate-900">Yango web order</h3>
              <p className="mt-2 text-sm text-slate-600">
                Yango blocks embedding its order page in an iframe, so open it in a new tab and use the
                copied route details from the panel on the right.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <a
                  href={buildYangoB2CHandoffUrl(handoffPreOrder)}
                  onClick={(event) => {
                    event.preventDefault();
                    openYangoOrderPageFromHandoff(handoffPreOrder);
                  }}
                  className="crm-button-primary rounded-xl px-3 py-2 text-sm font-semibold"
                >
                  Open Yango order page
                </a>
                <button
                  type="button"
                  onClick={() => void copyHandoffDetails(handoffPreOrder)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Copy full details
                </button>
              </div>
            </section>
            <aside className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-3">
              <div className="mb-2 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">B2C order details</h3>
                  <p className="text-xs text-slate-500">
                    Copy addresses and paste if the page did not auto-fill.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setHandoffPreOrder(null);
                    setHandoffOpenedOrderId(null);
                  }}
                  className="crm-hover-lift inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-lg font-semibold leading-none text-slate-700"
                  aria-label="Close B2C order modal"
                >
                  ×
                </button>
              </div>
              <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                <p>
                  <span className="font-semibold text-slate-900">Order ID:</span> {handoffPreOrder.orderId}
                </p>
                <p>
                  <span className="font-semibold text-slate-900">Client:</span> {handoffPreOrder.clientName}
                </p>
                <p>
                  <span className="font-semibold text-slate-900">Scheduled for:</span> {handoffPreOrder.scheduledFor}
                </p>
              </div>
              <div className="mt-3 space-y-2">
                <div className="rounded-xl border border-slate-200 bg-white p-2.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pickup</p>
                  <p className="mt-1 text-sm font-medium text-slate-900">{handoffPreOrder.pointA}</p>
                  <button
                    type="button"
                    onClick={() => copyToClipboard("handoffPickup", handoffPreOrder.pointA)}
                    className="mt-2 rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-200"
                  >
                    {copiedField === "handoffPickup" ? "Copied" : "Copy pickup"}
                  </button>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-2.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Destination</p>
                  <p className="mt-1 text-sm font-medium text-slate-900">{handoffPreOrder.pointB}</p>
                  <button
                    type="button"
                    onClick={() => copyToClipboard("handoffDestination", handoffPreOrder.pointB)}
                    className="mt-2 rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-200"
                  >
                    {copiedField === "handoffDestination" ? "Copied" : "Copy destination"}
                  </button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void copyHandoffDetails(handoffPreOrder)}
                  className="crm-hover-lift rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Copy full details
                </button>
                <a
                  href={buildYangoB2CHandoffUrl(handoffPreOrder)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setHandoffOpenedOrderId(handoffPreOrder.orderId)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Open in new tab
                </a>
                {handoffOpenedOrderId === handoffPreOrder.orderId ? (
                  <button
                    type="button"
                    disabled={cancellingOrderId === handoffPreOrder.orderId}
                    onClick={() => void cancelPreOrder(handoffPreOrder)}
                    className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {cancellingOrderId === handoffPreOrder.orderId
                      ? "Cancelling B2B order..."
                      : "Cancel B2B order"}
                  </button>
                ) : null}
              </div>
            </aside>
          </div>
        </div>
      ) : null}
    </section>
  );
}
