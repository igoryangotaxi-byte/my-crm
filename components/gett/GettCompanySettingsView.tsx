"use client";

import { useCallback, useEffect, useState } from "react";
import type { GettCompanySettings } from "@/lib/gett-api";

export function GettCompanySettingsView() {
  const [settings, setSettings] = useState<GettCompanySettings | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (refresh: boolean) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/gett/company-settings${refresh ? "?refresh=1" : ""}`, { cache: "no-store" });
      const data = (await res.json()) as { ok?: boolean; error?: string; settings?: GettCompanySettings };
      if (!res.ok || !data.ok || !data.settings) throw new Error(data.error ?? "Failed to load settings.");
      setSettings(data.settings);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setSettings(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  return (
    <section className="crm-page">
      <div className="crm-surface rounded-3xl p-4">
        <h2 className="crm-section-title">Gett company settings</h2>
        <p className="crm-subtitle mt-1">
          From <code className="text-xs">GET /v1/companies/settings</code> — reference fields, payment types, and ride
          rules cached for about one minute.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="crm-button-primary rounded-xl px-4 py-2 text-sm font-semibold"
            disabled={loading}
            onClick={() => void load(true)}
          >
            {loading ? "Loading…" : "Refresh now"}
          </button>
        </div>
        {error ? <p className="mt-2 text-sm text-rose-700">{error}</p> : null}
      </div>

      {settings && !loading ? (
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <div className="crm-surface rounded-3xl p-4">
            <h3 className="text-sm font-semibold text-slate-900">Rules</h3>
            <dl className="mt-2 space-y-2 text-sm">
              <div className="flex justify-between gap-2 border-b border-slate-100 py-1">
                <dt className="text-muted">Mandatory destination</dt>
                <dd className="font-medium">{settings.mandatory_destination ? "Yes" : "No"}</dd>
              </div>
              <div className="flex justify-between gap-2 border-b border-slate-100 py-1">
                <dt className="text-muted">Allow multi riders</dt>
                <dd className="font-medium">{settings.allow_multi_riders ? "Yes" : "No"}</dd>
              </div>
            </dl>
          </div>
          <div className="crm-surface rounded-3xl p-4">
            <h3 className="text-sm font-semibold text-slate-900">Payment types</h3>
            <ul className="mt-2 list-inside list-disc text-sm text-slate-800">
              {settings.payment_types.length ? (
                settings.payment_types.map((p) => <li key={p}>{p}</li>)
              ) : (
                <li className="text-muted">(none listed)</li>
              )}
            </ul>
          </div>
          <div className="crm-surface rounded-3xl p-4 lg:col-span-2">
            <h3 className="text-sm font-semibold text-slate-900">Reference fields (order payload)</h3>
            <div className="mt-2 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase text-muted">
                    <th className="py-2 pr-3">ID</th>
                    <th className="py-2 pr-3">Title</th>
                    <th className="py-2">Mandatory</th>
                  </tr>
                </thead>
                <tbody>
                  {settings.references.length ? (
                    settings.references.map((r) => (
                      <tr key={r.id} className="border-b border-slate-100">
                        <td className="py-2 pr-3 font-mono text-xs">{r.id}</td>
                        <td className="py-2 pr-3">{r.title || "—"}</td>
                        <td className="py-2">{r.mandatory ? "Yes" : "No"}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} className="py-4 text-muted">
                        No reference fields configured.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : loading ? (
        <p className="mt-4 text-sm text-muted">Loading…</p>
      ) : null}
    </section>
  );
}
