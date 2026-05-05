"use client";

import { useEffect, useMemo, useState } from "react";
import type { B2BDashboardOrder, YangoApiClientRef } from "@/types/crm";

type SummaryPayload = {
  ok: boolean;
  cached?: boolean;
  summary: {
    spendDay: number;
    spendWeek: number;
    spendMonth: number;
    spendTotal: number;
    averageCheck: number;
    rides: number;
  };
  topDepartments: Array<{ key: string; label: string; spend: number; rides: number }>;
  rows: B2BDashboardOrder[];
  errors: string[];
};

function money(value: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function toDateInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export function BussinessCenterPanel() {
  const [clients, setClients] = useState<YangoApiClientRef[]>([]);
  const [selectedClient, setSelectedClient] = useState<string>("");
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    return toDateInput(d.toISOString());
  });
  const [toDate, setToDate] = useState(() => toDateInput(new Date().toISOString()));
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<"csv" | "xlsx" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SummaryPayload | null>(null);

  const selectedClientRef = useMemo(
    () => clients.find((item) => `${item.tokenLabel}:${item.clientId}` === selectedClient) ?? null,
    [clients, selectedClient],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/request-rides-clients", { cache: "no-store" });
        const payload = (await response.json().catch(() => null)) as
          | { ok?: boolean; clients?: YangoApiClientRef[] }
          | null;
        if (!response.ok || !payload?.ok) throw new Error("Failed to load clients.");
        if (cancelled) return;
        const loaded = payload.clients ?? [];
        setClients(loaded);
      } catch {
        if (!cancelled) setError("Failed to load clients.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const load = async () => {
    if (!selectedClientRef) {
      setError("Select Client first.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const since = new Date(`${fromDate}T00:00:00.000Z`).toISOString();
      const till = new Date(`${toDate}T23:59:59.999Z`).toISOString();
      const response = await fetch("/api/bussiness-center/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenLabel: selectedClientRef.tokenLabel,
          clientId: selectedClientRef.clientId,
          since,
          till,
        }),
      });
      const payload = (await response.json().catch(() => null)) as SummaryPayload | null;
      if (!response.ok || !payload?.ok) throw new Error("Failed to load Bussiness Center data.");
      setData(payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load Bussiness Center data.");
    } finally {
      setLoading(false);
    }
  };

  const download = async (format: "csv" | "xlsx") => {
    if (!selectedClientRef) {
      setError("Select Client first.");
      return;
    }
    setExporting(format);
    setError(null);
    try {
      const since = new Date(`${fromDate}T00:00:00.000Z`).toISOString();
      const till = new Date(`${toDate}T23:59:59.999Z`).toISOString();
      const response = await fetch("/api/bussiness-center/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenLabel: selectedClientRef.tokenLabel,
          clientId: selectedClientRef.clientId,
          since,
          till,
          format,
        }),
      });
      if (!response.ok) throw new Error("Export failed.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `bussiness-center.${format}`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setExporting(null);
    }
  };

  return (
    <section className="crm-page space-y-4">
      <div className="rounded-2xl border border-white/70 bg-white/85 p-4">
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1 text-xs text-slate-600">
            Client
            <select
              value={selectedClient}
              onChange={(event) => setSelectedClient(event.target.value)}
              className="crm-input mt-1 h-10 w-full px-3 text-sm"
            >
              <option value="">Select Client</option>
              {clients.map((item) => (
                <option key={`${item.tokenLabel}:${item.clientId}`} value={`${item.tokenLabel}:${item.clientId}`}>
                  {item.clientName} ({item.tokenLabel})
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-600">
            From
            <input
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
              className="crm-input mt-1 h-10 px-3 text-sm"
            />
          </label>
          <label className="text-xs text-slate-600">
            To
            <input
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
              className="crm-input mt-1 h-10 px-3 text-sm"
            />
          </label>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="crm-button-primary h-10 rounded-xl px-4 text-sm font-semibold"
          >
            {loading ? "Refreshing..." : "Apply filters"}
          </button>
          <button
            type="button"
            onClick={() => void download("csv")}
            disabled={Boolean(exporting)}
            className="crm-hover-lift h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700"
          >
            {exporting === "csv" ? "Exporting..." : "Export CSV"}
          </button>
          <button
            type="button"
            onClick={() => void download("xlsx")}
            disabled={Boolean(exporting)}
            className="crm-hover-lift h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700"
          >
            {exporting === "xlsx" ? "Exporting..." : "Export XLSX"}
          </button>
        </div>
        {error ? <p className="mt-2 text-sm text-rose-700">{error}</p> : null}
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-2xl border border-white/70 bg-white/85 p-4">
          <p className="text-xs text-slate-500">Spend today</p>
          <p className="mt-1 text-xl font-semibold text-slate-900">{money(data?.summary.spendDay ?? 0)}</p>
        </div>
        <div className="rounded-2xl border border-white/70 bg-white/85 p-4">
          <p className="text-xs text-slate-500">Spend this week</p>
          <p className="mt-1 text-xl font-semibold text-slate-900">{money(data?.summary.spendWeek ?? 0)}</p>
        </div>
        <div className="rounded-2xl border border-white/70 bg-white/85 p-4">
          <p className="text-xs text-slate-500">Spend this month</p>
          <p className="mt-1 text-xl font-semibold text-slate-900">{money(data?.summary.spendMonth ?? 0)}</p>
        </div>
        <div className="rounded-2xl border border-white/70 bg-white/85 p-4">
          <p className="text-xs text-slate-500">Total spend (filter)</p>
          <p className="mt-1 text-xl font-semibold text-slate-900">{money(data?.summary.spendTotal ?? 0)}</p>
        </div>
        <div className="rounded-2xl border border-white/70 bg-white/85 p-4">
          <p className="text-xs text-slate-500">Average check</p>
          <p className="mt-1 text-xl font-semibold text-slate-900">{money(data?.summary.averageCheck ?? 0)}</p>
        </div>
      </div>

      <article className="rounded-2xl border border-white/70 bg-white/85 p-4">
        <h2 className="text-base font-semibold text-slate-900">Top departments by spend</h2>
        <div className="mt-3 space-y-2">
          {(data?.topDepartments ?? []).map((item) => (
            <div key={item.key} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2">
              <p className="text-sm font-medium text-slate-900">{item.label}</p>
              <p className="text-sm text-slate-700">{money(item.spend)} · {item.rides} rides</p>
            </div>
          ))}
          {(data?.topDepartments.length ?? 0) === 0 ? (
            <p className="text-sm text-slate-500">No department data yet for selected range.</p>
          ) : null}
        </div>
      </article>

      <article className="rounded-2xl border border-white/70 bg-white/85 p-4">
        <h2 className="text-base font-semibold text-slate-900">Orders</h2>
        <div className="mt-3 max-h-[50vh] overflow-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-slate-50">
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2">Order ID</th>
                <th className="px-3 py-2">Trip date</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Point A</th>
                <th className="px-3 py-2">Point B</th>
                <th className="px-3 py-2">Client paid</th>
              </tr>
            </thead>
            <tbody>
              {(data?.rows ?? []).map((row) => (
                <tr key={`${row.tokenLabel}:${row.clientId}:${row.orderId}`} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium text-slate-900">{row.orderId}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-700">{row.scheduledAt}</td>
                  <td className="px-3 py-2 text-slate-700">{row.statusRaw}</td>
                  <td className="max-w-[18rem] truncate px-3 py-2 text-slate-700">{row.pointA}</td>
                  <td className="max-w-[18rem] truncate px-3 py-2 text-slate-700">{row.pointB}</td>
                  <td className="px-3 py-2 text-slate-700">{money(row.clientPaid)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
