"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/components/auth/AuthProvider";
import { ClientHealthBadge } from "@/components/sales-operation/ClientHealthBadge";
import { computeClientHealth } from "@/lib/sales-operation/client-health";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  SalesClientManagerFields,
  type SalesClientManagerDraft,
} from "@/components/sales-operation/SalesClientManagerFields";
import { formatSalesDateTime } from "@/lib/sales-operation/display";
import { buildSalesOperationB2BClientTripsHref } from "@/lib/sales-operation/b2b-client-trips-href";
import type { SalesClientMetricsSummary } from "@/lib/sales-operation/client-overview-metrics";
import type { B2BClientRegistryEntry } from "@/lib/sales-operation/manager-types";
import type { SalesClient, SalesClientNote } from "@/lib/sales-operation/types";
import type { YangoSupabaseOrderMetric } from "@/types/crm";

type SalesClientDetailViewProps = {
  clientId: string;
};

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "n/a";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function defaultRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 90);
  const fmt = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };
  return { from: fmt(from), to: fmt(to) };
}

export function SalesClientDetailView({ clientId }: SalesClientDetailViewProps) {
  const t = useTranslations("salesOperation");
  const router = useRouter();
  const { users } = useAuth();
  const [client, setClient] = useState<SalesClient | null>(null);
  const [notes, setNotes] = useState<SalesClientNote[]>([]);
  const [metrics, setMetrics] = useState<SalesClientMetricsSummary | null>(null);
  const [trips, setTrips] = useState<YangoSupabaseOrderMetric[]>([]);
  const [registry, setRegistry] = useState<B2BClientRegistryEntry[]>([]);
  const [draft, setDraft] = useState<SalesClientManagerDraft>({
    corpClientId: "",
    accountManagerUserId: "",
    salesManagerUserId: "",
  });
  const [range, setRange] = useState(defaultRange);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ from: range.from, to: range.to });
      const [detailRes, registryRes] = await Promise.all([
        fetch(`/api/sales-operation/clients/${clientId}?${params.toString()}`, {
          cache: "no-store",
        }),
        fetch("/api/sales-operation/b2b-clients/registry", { cache: "no-store" }),
      ]);
      const detailData = (await detailRes.json()) as {
        ok?: boolean;
        client?: SalesClient;
        notes?: SalesClientNote[];
        metrics?: SalesClientMetricsSummary | null;
        trips?: YangoSupabaseOrderMetric[];
        error?: string;
      };
      const registryData = (await registryRes.json()) as {
        ok?: boolean;
        registry?: B2BClientRegistryEntry[];
      };
      if (!detailRes.ok || !detailData.ok || !detailData.client) {
        throw new Error(detailData.error ?? "Failed to load client.");
      }
      setClient(detailData.client);
      setNotes(detailData.notes ?? []);
      setMetrics(detailData.metrics ?? null);
      setTrips(detailData.trips ?? []);
      if (registryRes.ok && registryData.ok) {
        setRegistry(registryData.registry ?? []);
      }
      setDraft({
        corpClientId: detailData.client.corpClientId ?? "",
        accountManagerUserId: detailData.client.accountManagerUserId ?? "",
        salesManagerUserId: detailData.client.salesManagerUserId ?? "",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load client.");
    } finally {
      setLoading(false);
    }
  }, [clientId, range.from, range.to]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const health = useMemo(() => {
    if (!client?.corpClientId || !metrics) return null;
    return computeClientHealth({
      trips: metrics.trips,
      gmv: metrics.gmv,
      decouplingRate: metrics.decouplingRate,
      lastTripAt: trips[0]?.scheduledAt ?? null,
      signedAt: client.signedAt,
    });
  }, [client?.corpClientId, client?.signedAt, metrics, trips]);

  const saveManagers = async () => {
    if (!client) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/sales-operation/clients/${client.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          corpClientId: draft.corpClientId.trim() || null,
          accountManagerUserId: draft.accountManagerUserId || null,
          salesManagerUserId: draft.salesManagerUserId || null,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; client?: SalesClient; error?: string };
      if (!res.ok || !data.ok || !data.client) {
        throw new Error(data.error ?? "Failed to save client.");
      }
      setClient(data.client);
      setDraft({
        corpClientId: data.client.corpClientId ?? "",
        accountManagerUserId: data.client.accountManagerUserId ?? "",
        salesManagerUserId: data.client.salesManagerUserId ?? "",
      });
      await loadDetail();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save client.");
    } finally {
      setSaving(false);
    }
  };

  if (loading && !client) {
    return <p className="crm-page text-sm text-muted">{t("loading")}</p>;
  }

  if (!client) {
    return (
      <section className="crm-page">
        <p className="text-sm text-rose-700">{error ?? "Client not found."}</p>
        <button
          type="button"
          onClick={() => router.push("/sales-operation/clients")}
          className="mt-3 text-sm font-semibold text-accent hover:underline"
        >
          ← {t("tab.clients")}
        </button>
      </section>
    );
  }

  return (
    <section className="crm-page space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/sales-operation/clients"
            className="text-sm font-medium text-accent hover:underline"
          >
            ← {t("tab.clients")}
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">{client.fullName}</h1>
          <p className="text-sm text-muted">
            {t("signedAt")}: {formatSalesDateTime(client.signedAt)}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {health ? <ClientHealthBadge status={health.status} score={health.score} /> : null}
            {client.accountManagerName ? (
              <span className="inline-flex rounded-full bg-sky-50 px-2 py-0.5 text-[0.7rem] font-semibold text-sky-800">
                {t("manager.accountManager")}: {client.accountManagerName}
              </span>
            ) : null}
            {client.salesManagerName || client.pendingSalesManagerName ? (
              <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[0.7rem] font-semibold text-emerald-800">
                {t("manager.salesManager")}:{" "}
                {client.salesManagerName ?? client.pendingSalesManagerName}
              </span>
            ) : null}
          </div>
        </div>
        {client.campaignName ? (
          <StatusBadge label={client.campaignName} tone="blue" />
        ) : null}
      </div>

      {error ? <p className="text-sm text-rose-700">{error}</p> : null}

      {health ? (
        <article className="rounded-3xl border border-white/70 bg-white/70 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="crm-section-title mb-0">{t("health.title")}</h2>
            <ClientHealthBadge status={health.status} score={health.score} />
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-sm">
            <span className="text-slate-700">
              {t("health.lastTrip")}:{" "}
              <span className="font-semibold">
                {health.daysSinceLastTrip === null
                  ? "—"
                  : t("portfolio.daysAgo", { days: health.daysSinceLastTrip })}
              </span>
            </span>
            {health.reasons.length > 0 ? (
              <span className="flex flex-wrap gap-1.5">
                {health.reasons.map((reason) => (
                  <span
                    key={reason}
                    className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[0.7rem] font-medium text-slate-700"
                  >
                    {t(`health.reason.${reason}`)}
                  </span>
                ))}
              </span>
            ) : null}
          </div>
        </article>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-3xl border border-white/70 bg-white/70 p-4">
          <h2 className="crm-section-title mb-3">{t("clientDetails")}</h2>
          <dl className="grid gap-2 text-sm">
            <div>
              <dt className="crm-label">{t("field.email")}</dt>
              <dd className="text-slate-800">{client.email ?? "—"}</dd>
            </div>
            <div>
              <dt className="crm-label">{t("field.phone")}</dt>
              <dd className="text-slate-800">{client.phone ?? "—"}</dd>
            </div>
            <div>
              <dt className="crm-label">{t("field.company")}</dt>
              <dd className="text-slate-800">{client.companyName ?? "—"}</dd>
            </div>
            <div>
              <dt className="crm-label">{t("field.corpClient")}</dt>
              <dd className="text-slate-800">
                {client.corpClientName ?? client.corpClientId ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="crm-label">{t("manager.accountManager")}</dt>
              <dd className="text-slate-800">{client.accountManagerName ?? "—"}</dd>
            </div>
            <div>
              <dt className="crm-label">{t("manager.salesManager")}</dt>
              <dd className="text-slate-800">
                {client.salesManagerName ?? client.pendingSalesManagerName ?? "—"}
              </dd>
            </div>
          </dl>
          {!client.corpClientId ? (
            <p className="mt-3 text-xs text-muted">{t("client.linkB2BHint")}</p>
          ) : null}
        </article>

        <article className="rounded-3xl border border-white/70 bg-white/70 p-4">
          <h2 className="crm-section-title mb-3">{t("manager.editManagers")}</h2>
          <SalesClientManagerFields
            users={users}
            registry={registry}
            draft={draft}
            onChange={setDraft}
            pendingSalesManagerName={client.pendingSalesManagerName}
            assignedSalesManagerName={client.salesManagerName}
          />
          <button
            type="button"
            onClick={() => void saveManagers()}
            disabled={saving}
            className="crm-button-primary mt-3 rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-60"
          >
            {saving ? t("saving") : t("saveLead")}
          </button>
        </article>
      </div>

      <article className="rounded-3xl border border-white/70 bg-white/70 p-4">
        <h2 className="crm-section-title mb-3">{t("notes")}</h2>
        {notes.length === 0 ? (
          <p className="text-sm text-muted">{t("noNotes")}</p>
        ) : (
          <div className="space-y-2">
            {notes.map((note) => (
              <div key={note.id} className="rounded-xl border border-slate-200/80 bg-slate-50 px-3 py-2">
                <p className="text-xs text-muted">
                  {note.authorName} · {formatSalesDateTime(note.createdAt)}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{note.body}</p>
              </div>
            ))}
          </div>
        )}
      </article>

      {client.corpClientId ? (
        <>
          <article className="rounded-3xl border border-white/70 bg-white/70 p-4">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <h2 className="crm-section-title mb-0">{t("client.b2bPerformance")}</h2>
              <div className="flex flex-wrap items-end gap-2">
                <label className="text-xs text-muted">
                  {t("manager.from")}
                  <input
                    type="date"
                    value={range.from}
                    onChange={(event) => setRange((prev) => ({ ...prev, from: event.target.value }))}
                    className="crm-input mt-1 block h-9 px-2.5 text-sm"
                  />
                </label>
                <label className="text-xs text-muted">
                  {t("manager.to")}
                  <input
                    type="date"
                    value={range.to}
                    onChange={(event) => setRange((prev) => ({ ...prev, to: event.target.value }))}
                    className="crm-input mt-1 block h-9 px-2.5 text-sm"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void loadDetail()}
                  className="crm-button-primary h-9 rounded-lg px-3 text-sm font-semibold"
                >
                  {t("manager.refresh")}
                </button>
              </div>
            </div>
            {metrics ? (
              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-2xl border border-border bg-white/80 p-3">
                  <p className="text-xs text-muted">{t("manager.requests")}</p>
                  <p className="text-xl font-semibold">{metrics.requests.toLocaleString("en-US")}</p>
                </div>
                <div className="rounded-2xl border border-border bg-white/80 p-3">
                  <p className="text-xs text-muted">{t("manager.trips")}</p>
                  <p className="text-xl font-semibold">{metrics.trips.toLocaleString("en-US")}</p>
                </div>
                <div className="rounded-2xl border border-border bg-white/80 p-3">
                  <p className="text-xs text-muted">{t("manager.gmv")}</p>
                  <p className="text-xl font-semibold">{formatMoney(metrics.gmv)}</p>
                </div>
                <div className="rounded-2xl border border-border bg-white/80 p-3">
                  <p className="text-xs text-muted">{t("manager.decouplingRate")}</p>
                  <p className="text-xl font-semibold">{formatPercent(metrics.decouplingRate)}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted">{t("client.noB2BMetrics")}</p>
            )}
          </article>

          <article className="rounded-3xl border border-white/70 bg-white/70 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="crm-section-title mb-0">{t("client.recentTrips")}</h2>
              <Link
                href={buildSalesOperationB2BClientTripsHref({
                  corpClientId: client.corpClientId,
                  clientName: client.corpClientName ?? client.fullName,
                  from: range.from,
                  to: range.to,
                })}
                className="text-sm font-semibold text-accent hover:underline"
              >
                {t("client.viewAllTrips")}
              </Link>
            </div>
            {trips.length === 0 ? (
              <p className="text-sm text-muted">{t("client.noTripsInRange")}</p>
            ) : (
              <div className="overflow-auto rounded-2xl border border-border/70">
                <table className="min-w-full text-xs">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-3 py-2 text-left">{t("client.tripDate")}</th>
                      <th className="px-3 py-2 text-left">{t("client.orderId")}</th>
                      <th className="px-3 py-2 text-right">{t("manager.gmv")}</th>
                      <th className="px-3 py-2 text-right">{t("manager.decoupling")}</th>
                      <th className="px-3 py-2 text-left">{t("field.status")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/70">
                    {trips.map((trip) => (
                      <tr key={trip.orderId}>
                        <td className="px-3 py-2">{formatDateTime(trip.scheduledAt)}</td>
                        <td className="px-3 py-2 font-mono text-[11px]">{trip.orderId}</td>
                        <td className="px-3 py-2 text-right">{formatMoney(trip.clientPaid)}</td>
                        <td className="px-3 py-2 text-right">{formatMoney(trip.decoupling)}</td>
                        <td className="px-3 py-2">
                          {trip.successOrderFlag === true ? "Completed" : trip.statusRaw || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </article>
        </>
      ) : (
        <article className="rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {t("client.linkB2BHint")}
        </article>
      )}
    </section>
  );
}
