"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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

function pickDriverName(raw: Record<string, unknown>): string | null {
  const order = raw.order as Record<string, unknown> | undefined;
  if (!order) return null;
  const actual = order.actual as Record<string, unknown> | undefined;
  const supplier = actual?.supplier as Record<string, unknown> | undefined;
  const driver = supplier?.driver as Record<string, unknown> | undefined;
  const name = driver?.driver_name ?? driver?.name;
  if (typeof name === "string" && name.trim()) return name.trim();
  return null;
}

function pickEta(raw: Record<string, unknown>): string | null {
  const ri = raw.route_info as Record<string, unknown> | undefined;
  const eta = ri?.eta_to_destination_minutes;
  if (typeof eta === "number" && Number.isFinite(eta)) return `${eta} min to destination`;
  return null;
}

export function GettOrdersDataView({ mode }: GettOrdersDataViewProps) {
  const [from, setFrom] = useState(() => new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString().slice(0, 16));
  const [to, setTo] = useState(() => new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString().slice(0, 16));
  const [rows, setRows] = useState<GettRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [detailOrderId, setDetailOrderId] = useState<string | null>(null);
  const [detailRaw, setDetailRaw] = useState<Record<string, unknown> | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

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

  const loadDetail = useCallback(async (orderId: string) => {
    setDetailLoading(true);
    setDetailError("");
    setDetailRaw(null);
    try {
      const res = await fetch(`/api/gett/orders/detail?orderId=${encodeURIComponent(orderId)}`, { cache: "no-store" });
      const data = (await res.json()) as { ok?: boolean; error?: string; raw?: Record<string, unknown> };
      if (!res.ok || !data.ok || !data.raw) throw new Error(data.error ?? "Failed to load order detail.");
      setDetailRaw(data.raw);
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : "Detail error");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (detailOrderId) void loadDetail(detailOrderId);
  }, [detailOrderId, loadDetail]);

  const filteredRows = useMemo(() => {
    if (mode === "orders") return rows;
    const now = Date.now();
    return rows.filter((row) => {
      if (!row.scheduledAt) return false;
      const due = new Date(row.scheduledAt).getTime();
      return Number.isFinite(due) && due > now;
    });
  }, [mode, rows]);

  const detailSummary = useMemo(() => {
    if (!detailRaw) return null;
    const status =
      typeof detailRaw.status === "string"
        ? detailRaw.status
        : typeof (detailRaw.order as Record<string, unknown> | undefined)?.status === "string"
          ? String((detailRaw.order as Record<string, unknown>).status)
          : "—";
    const driver = pickDriverName(detailRaw);
    const eta = pickEta(detailRaw);
    return { status, driver, eta };
  }, [detailRaw]);

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

      <div className={`mt-3 grid gap-3 ${detailOrderId ? "xl:grid-cols-[1fr_minmax(18rem,24rem)]" : ""}`}>
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
                    <td className="rounded-l-xl px-3 py-2">
                      <button
                        type="button"
                        className="text-left text-sm font-medium text-sky-800 underline decoration-sky-300 hover:text-sky-950"
                        onClick={() => setDetailOrderId((cur) => (cur === row.orderId ? null : row.orderId))}
                      >
                        {row.orderId}
                      </button>
                    </td>
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

        {detailOrderId ? (
          <aside className="crm-surface max-h-[70vh] overflow-y-auto rounded-3xl p-4 xl:max-h-none">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900">Order detail</h3>
              <button type="button" className="text-xs text-slate-500 hover:text-slate-800" onClick={() => setDetailOrderId(null)}>
                Close
              </button>
            </div>
            <p className="mt-1 font-mono text-xs text-muted">{detailOrderId}</p>
            {detailLoading ? <p className="mt-2 text-sm text-muted">Loading…</p> : null}
            {detailError ? <p className="mt-2 text-sm text-rose-700">{detailError}</p> : null}
            {detailSummary && !detailLoading ? (
              <dl className="mt-3 space-y-2 rounded-xl bg-white/80 p-3 text-sm">
                <div>
                  <dt className="text-xs text-muted">Status</dt>
                  <dd className="font-semibold text-slate-900">{detailSummary.status}</dd>
                </div>
                {detailSummary.driver ? (
                  <div>
                    <dt className="text-xs text-muted">Driver</dt>
                    <dd className="font-medium text-slate-800">{detailSummary.driver}</dd>
                  </div>
                ) : null}
                {detailSummary.eta ? (
                  <div>
                    <dt className="text-xs text-muted">Route</dt>
                    <dd className="font-medium text-slate-800">{detailSummary.eta}</dd>
                  </div>
                ) : null}
              </dl>
            ) : null}
            {detailRaw && !detailLoading ? (
              <pre className="mt-3 max-h-[50vh] overflow-auto rounded-xl bg-slate-900/90 p-3 text-[11px] leading-relaxed text-emerald-100">
                {JSON.stringify(detailRaw, null, 2)}
              </pre>
            ) : null}
          </aside>
        ) : null}
      </div>
    </section>
  );
}
