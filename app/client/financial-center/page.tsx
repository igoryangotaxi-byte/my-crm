"use client";

import { ClientPortalSectionGate } from "@/components/client/ClientPortalSectionGate";
import { useEffect, useMemo, useState } from "react";

type TopBucket = {
  key: string;
  label: string;
  spend: number;
  rides: number;
};

type FinancialResponse = {
  ok: boolean;
  range: { since: string; till: string };
  summary: {
    spendDay: number;
    spendWeek: number;
    spendMonth: number;
    spendTotal: number;
    averageCheck: number;
    rides: number;
  };
  topDepartments: TopBucket[];
  errors: string[];
};

function money(value: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function toDateInput(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function ClientFinancialCenterInner() {
  const now = useMemo(() => new Date(), []);
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    return toDateInput(d.toISOString());
  });
  const [toDate, setToDate] = useState(() => toDateInput(now.toISOString()));
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<"csv" | "xlsx" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<FinancialResponse | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const since = new Date(`${fromDate}T00:00:00.000Z`).toISOString();
      const till = new Date(`${toDate}T23:59:59.999Z`).toISOString();
      const response = await fetch("/api/client-financial-center/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ since, till }),
      });
      const payload = (await response.json().catch(() => null)) as FinancialResponse | null;
      if (!response.ok || !payload?.ok) {
        throw new Error("Failed to load financial center data.");
      }
      setData(payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load financial center data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const download = async (format: "csv" | "xlsx") => {
    setExporting(format);
    try {
      const since = new Date(`${fromDate}T00:00:00.000Z`).toISOString();
      const till = new Date(`${toDate}T23:59:59.999Z`).toISOString();
      const response = await fetch("/api/client-financial-center/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ since, till, format }),
      });
      if (!response.ok) throw new Error("Export failed.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `financial-center.${format}`;
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
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Financial Center</h1>
            <p className="text-sm text-slate-600">
              Spend, average check and top departments by selected range.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
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
              <p className="text-sm text-slate-700">
                {money(item.spend)} · {item.rides} rides
              </p>
            </div>
          ))}
          {(data?.topDepartments.length ?? 0) === 0 ? (
            <p className="text-sm text-slate-500">No department data yet for selected range.</p>
          ) : null}
        </div>
        {(data?.errors.length ?? 0) > 0 ? (
          <p className="mt-2 text-xs text-amber-700">Some sources returned partial data: {data?.errors.join("; ")}</p>
        ) : null}
      </article>
    </section>
  );
}

export default function ClientFinancialCenterPage() {
  return (
    <ClientPortalSectionGate section="financialCenter">
      <ClientFinancialCenterInner />
    </ClientPortalSectionGate>
  );
}
