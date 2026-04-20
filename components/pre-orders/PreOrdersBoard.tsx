"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PageHeading } from "@/components/ui/PageHeading";
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

export function PreOrdersBoard({ preOrders, errors }: PreOrdersBoardProps) {
  const [selectedPreOrder, setSelectedPreOrder] = useState<PreOrder | null>(null);
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const getDriverFallbackText = (preOrder: PreOrder) =>
    preOrder.orderStatus === "scheduling"
      ? "Not provided by API yet"
      : "Not assigned";

  const isDriverAssigned = (preOrder: PreOrder) => {
    const status = preOrder.orderStatus?.toLowerCase() ?? "";
    const assignedStatuses = new Set([
      "driving",
      "transporting",
      "waiting",
      "pickup",
      "assigned",
    ]);

    return preOrder.driverAssigned || assignedStatuses.has(status);
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

  return (
    <section>
      <PageHeading
        title="Pre-Orders"
        subtitle="Upcoming scheduled rides from Yango API"
      />

      {errors.length > 0 ? (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-semibold">Some clients are unavailable</p>
          <p className="mt-1">{errors.join(" | ")}</p>
        </div>
      ) : null}

      <div className="mb-4 rounded-2xl border border-border bg-panel p-3">
        <div className="flex flex-wrap items-end justify-center gap-3 lg:justify-start">
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
                className={`rounded-xl px-3 py-1.5 text-sm font-medium transition ${
                  filterMode === item.mode
                    ? "bg-accent text-white"
                    : "bg-[#f3f3f5] text-slate-700 hover:bg-slate-200"
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
                className="mt-1 block h-9 rounded-lg border border-border bg-white px-2.5 text-sm text-slate-700 outline-none focus:border-accent"
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
                className="mt-1 block h-9 rounded-lg border border-border bg-white px-2.5 text-sm text-slate-700 outline-none focus:border-accent"
              />
            </label>
          </div>
        </div>
      </div>

      {filteredPreOrders.length === 0 ? (
        <div className="glass-surface rounded-3xl px-4 py-10 text-center text-sm text-muted">
          No pre-orders found for selected filter.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {filteredPreOrders.map((preOrder) => (
            <article
              key={preOrder.id}
              className={`group glass-surface rounded-3xl p-4 transition duration-300 ease-out hover:-translate-y-1.5 hover:scale-[1.015] hover:shadow-2xl ${
                isDriverAssigned(preOrder)
                  ? "bg-emerald-100/45"
                  : "bg-rose-100/45"
              }`}
            >
              <button
                type="button"
                onClick={() => setSelectedPreOrder(preOrder)}
                className="w-full text-left"
              >
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                      Pre-order
                    </p>
                    <h2 className="mt-1 text-lg font-semibold text-foreground">
                      {preOrder.clientName}
                    </h2>
                  </div>
                  <span className="rounded-full bg-white/75 px-2.5 py-1 text-xs font-semibold text-slate-700">
                    {preOrder.clientPrice}
                  </span>
                </div>

                <dl className="space-y-3 text-sm">
                  <div>
                    <dt className="text-muted">Scheduled for</dt>
                    <dd className="font-medium text-slate-900">{preOrder.scheduledFor}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Point A</dt>
                    <dd className="font-medium text-slate-900">{preOrder.pointA}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Point B</dt>
                    <dd className="font-medium text-slate-900">{preOrder.pointB}</dd>
                  </div>
                </dl>
              </button>

              <div className="mt-4 border-t border-white/60 pt-3">
                <Link
                  href={`https://go-admin-frontend.taxi.yandex-team.ru/orders/${preOrder.orderId}`}
                  className="font-medium text-accent hover:underline"
                  onClick={(event) => event.stopPropagation()}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Order: {preOrder.orderId}
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}

      {selectedPreOrder ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 px-4 py-8 backdrop-blur-sm"
          onClick={() => setSelectedPreOrder(null)}
        >
          <div
            className="w-full max-w-3xl rounded-3xl border border-slate-200 bg-white/96 p-3 shadow-2xl backdrop-blur-xl lg:p-4"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3 px-1">
              <h3 className="text-xl font-semibold text-foreground">
                Order at {selectedPreOrder.scheduledFor}
              </h3>
              <button
                type="button"
                onClick={() => setSelectedPreOrder(null)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-lg font-semibold leading-none text-slate-700 transition hover:bg-slate-200"
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
              </aside>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
