"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import type { PreOrder } from "@/types/crm";

type PreOrdersBoardProps = {
  preOrders: PreOrder[];
  errors: string[];
};

type FilterMode = "all" | "today" | "tomorrow" | "range";

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
  const { currentUser } = useAuth();
  const isClientScopedUser = currentUser?.accountType === "client";
  const router = useRouter();
  const [selectedPreOrder, setSelectedPreOrder] = useState<PreOrder | null>(null);
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

  const fallbackStatusBadge = (preOrder: PreOrder) => {
    const status = preOrder.fallback?.status;
    if (!status || status === "idle") return null;
    if (status === "completed") {
      return (
        <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
          Fallback to B2C
        </span>
      );
    }
    if (status === "failed") {
      return (
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
          Fallback failed
        </span>
      );
    }
    if (status === "in_progress") {
      return (
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
          Fallback running
        </span>
      );
    }
    return (
      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
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
    <section className="crm-page mx-3">
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

      <div className="mb-0.5 rounded-2xl border border-border bg-panel p-3">
        <div className="flex flex-wrap items-end justify-center gap-3 lg:justify-between">
          <div className="flex flex-wrap gap-2">
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
                className={`crm-hover-lift rounded-xl px-3 py-1.5 text-sm font-medium transition ${
                  filterMode === item.mode
                    ? "crm-button-primary text-white"
                    : "bg-white/70 text-slate-700 hover:bg-white"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-muted">
              From
              <input
                type="date"
                value={fromDate}
                onChange={(event) => {
                  setFilterMode("range");
                  setFromDate(event.target.value);
                }}
                className="crm-input mt-1 block h-9 px-2.5 text-sm text-slate-700"
              />
            </label>
            <label className="text-xs text-muted">
              To
              <input
                type="date"
                value={toDate}
                onChange={(event) => {
                  setFilterMode("range");
                  setToDate(event.target.value);
                }}
                className="crm-input mt-1 block h-9 px-2.5 text-sm text-slate-700"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f1f5f9_100%)] px-3 py-1 text-xs font-semibold text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_6px_14px_rgba(15,23,42,0.12)]">
              Assigned: {preOrdersCounts.assigned}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f1f5f9_100%)] px-3 py-1 text-xs font-semibold text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_6px_14px_rgba(15,23,42,0.12)]">
              Unassigned: {preOrdersCounts.unassigned}
            </span>
          </div>
        </div>
      </div>

      {filteredPreOrders.length === 0 ? (
        <div className="glass-surface rounded-3xl px-4 py-10 text-center text-sm text-muted">
          No pre-orders found for selected filter.
        </div>
      ) : (
        <section className="glass-surface mt-0.5 overflow-hidden rounded-3xl">
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-[#f6f6f8]">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                    Pre-order
                  </th>
                  {!isClientScopedUser ? (
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                      Client
                    </th>
                  ) : null}
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                    Status
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                    Scheduled for
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                    Route
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                    Adminka
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredPreOrders.map((preOrder) => {
                  const assigned = isDriverAssigned(preOrder);
                  return (
                    <tr
                      key={preOrder.id}
                      className={`crm-hover-lift cursor-pointer hover:bg-white/70 ${assigned ? "bg-emerald-50/45" : "bg-rose-50/45"}`}
                      onClick={() => setSelectedPreOrder(preOrder)}
                    >
                      <td className="px-3 py-2 text-sm font-medium text-slate-900">{preOrder.orderId}</td>
                      {!isClientScopedUser ? (
                        <td className="px-3 py-2 text-sm text-slate-700">{preOrder.clientName}</td>
                      ) : null}
                      <td className="px-3 py-2 text-sm">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                              assigned ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                            }`}
                          >
                            {assigned ? "Assigned" : "Unassigned"}
                          </span>
                          {fallbackStatusBadge(preOrder)}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-sm text-slate-700">{preOrder.scheduledFor}</td>
                      <td className="px-3 py-2 text-sm text-slate-700">
                        <span className="block max-w-[22rem] truncate">
                          {preOrder.pointA} {"->"} {preOrder.pointB}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-sm">
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
                      <td className="px-3 py-2 text-sm">
                        <div className="flex flex-wrap items-center gap-1.5">
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
                <button
                  type="button"
                  onClick={() => void openB2CWebOrder(selectedPreOrder)}
                  className="mt-2 w-full rounded-xl border border-sky-200 bg-sky-50 py-2.5 text-sm font-semibold text-sky-800 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Open in Yango B2C
                </button>
              </aside>
            </div>
          </div>
        </div>
      ) : null}
      {handoffPreOrder ? (
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
