"use client";

import { useEffect, useState } from "react";

type Summary = { total: number; completed: number; cancelled: number; preOrders: number };

export function GettBusinessCenterView() {
  const [from, setFrom] = useState(() => new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString().slice(0, 16));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 16));
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadSummary() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/gett/orders/by-period?from=${encodeURIComponent(new Date(from).toISOString())}&to=${encodeURIComponent(new Date(to).toISOString())}`);
      const data = (await response.json()) as { ok?: boolean; error?: string; summary?: Summary };
      if (!response.ok || !data.ok || !data.summary) throw new Error(data.error ?? "Failed to fetch Gett metrics.");
      setSummary(data.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch metrics.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="crm-page">
      <div className="crm-surface rounded-3xl p-4">
        <h2 className="crm-section-title">Gett Bussiness Center</h2>
        <p className="crm-subtitle mt-1">Operational summary powered by Gett orders API.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input type="datetime-local" className="crm-input px-3 py-2 text-sm" value={from} onChange={(e) => setFrom(e.target.value)} />
          <input type="datetime-local" className="crm-input px-3 py-2 text-sm" value={to} onChange={(e) => setTo(e.target.value)} />
          <button type="button" className="crm-button-primary rounded-xl px-4 py-2 text-sm font-semibold" onClick={() => void loadSummary()} disabled={loading}>
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
        {error ? <p className="mt-2 text-sm text-rose-700">{error}</p> : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="crm-surface rounded-3xl p-4">
          <p className="crm-label">Total orders</p>
          <p className="mt-2 text-2xl font-bold text-foreground">{summary?.total ?? 0}</p>
        </div>
        <div className="crm-surface rounded-3xl p-4">
          <p className="crm-label">Completed</p>
          <p className="mt-2 text-2xl font-bold text-foreground">{summary?.completed ?? 0}</p>
        </div>
        <div className="crm-surface rounded-3xl p-4">
          <p className="crm-label">Cancelled</p>
          <p className="mt-2 text-2xl font-bold text-foreground">{summary?.cancelled ?? 0}</p>
        </div>
        <div className="crm-surface rounded-3xl p-4">
          <p className="crm-label">Pre-orders</p>
          <p className="mt-2 text-2xl font-bold text-foreground">{summary?.preOrders ?? 0}</p>
        </div>
      </div>
    </section>
  );
}
