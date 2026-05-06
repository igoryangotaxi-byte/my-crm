"use client";

import { useEffect, useMemo, useState } from "react";

type GettRow = {
  orderId: string;
  status: string;
  scheduledAt: string | null;
  createdAt: string | null;
  productName: string | null;
  driverName: string | null;
};

type GettOrdersDataViewProps = {
  mode: "orders" | "pre-orders";
};

export function GettOrdersDataView({ mode }: GettOrdersDataViewProps) {
  const [from, setFrom] = useState(() => new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString().slice(0, 16));
  const [to, setTo] = useState(() => new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString().slice(0, 16));
  const [rows, setRows] = useState<GettRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/gett/orders/by-period?from=${encodeURIComponent(new Date(from).toISOString())}&to=${encodeURIComponent(new Date(to).toISOString())}`);
      const data = (await response.json()) as { ok?: boolean; error?: string; rows?: GettRow[] };
      if (!response.ok || !data.ok) throw new Error(data.error ?? "Failed to fetch Gett orders.");
      setRows(Array.isArray(data.rows) ? data.rows : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredRows = useMemo(() => {
    if (mode === "orders") return rows;
    const now = Date.now();
    return rows.filter((row) => {
      if (!row.scheduledAt) return false;
      const due = new Date(row.scheduledAt).getTime();
      return Number.isFinite(due) && due > now;
    });
  }, [mode, rows]);

  return (
    <section className="crm-page">
      <div className="crm-surface rounded-3xl p-4">
        <h2 className="crm-section-title">{mode === "orders" ? "Gett Orders" : "Gett Pre-Orders"}</h2>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input type="datetime-local" className="crm-input px-3 py-2 text-sm" value={from} onChange={(e) => setFrom(e.target.value)} />
          <input type="datetime-local" className="crm-input px-3 py-2 text-sm" value={to} onChange={(e) => setTo(e.target.value)} />
          <button type="button" className="crm-button-primary rounded-xl px-4 py-2 text-sm font-semibold" onClick={() => void loadData()} disabled={loading}>
            {loading ? "Loading..." : "Reload"}
          </button>
        </div>
        {error ? <p className="mt-2 text-sm text-rose-700">{error}</p> : null}
      </div>

      <section className="glass-surface overflow-hidden rounded-3xl">
        <div className="overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-y-2">
            <thead className="bg-[#f6f6f8]">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">Order ID</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">Status</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">Scheduled</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">Created</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">Product</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">Driver</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.orderId} className="[&>td]:bg-white/85">
                  <td className="rounded-l-xl px-3 py-2 text-sm text-slate-900">{row.orderId}</td>
                  <td className="px-3 py-2 text-sm text-slate-800">{row.status}</td>
                  <td className="px-3 py-2 text-sm text-slate-700">{row.scheduledAt ?? "-"}</td>
                  <td className="px-3 py-2 text-sm text-slate-700">{row.createdAt ?? "-"}</td>
                  <td className="px-3 py-2 text-sm text-slate-700">{row.productName ?? "-"}</td>
                  <td className="rounded-r-xl px-3 py-2 text-sm text-slate-700">{row.driverName ?? "-"}</td>
                </tr>
              ))}
              {!loading && filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-sm text-muted">
                    No rows found. Configure `GETT_REPORTS_ORDERS_BY_PERIOD_URL` to populate this section.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
