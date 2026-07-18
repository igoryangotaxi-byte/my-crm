"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/components/auth/AuthProvider";
import { ClientHealthBadge } from "@/components/sales-operation/ClientHealthBadge";
import { computeClientHealth } from "@/lib/sales-operation/client-health";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { StatTile } from "@/components/ui/StatTile";
import { PageHeader } from "@/components/ui/PageHeader";
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
          onClick={() => router.push("/sales-operation/b2b-clients")}
          className="mt-3 text-sm font-semibold text-accent hover:underline"
        >
          ← {t("tab.b2bClients")}
        </button>
      </section>
    );
  }

  return (
    <section className="crm-page space-y-4">
      <PageHeader
        breadcrumbs={[
          { label: t("tab.b2bClients"), href: "/sales-operation/b2b-clients" },
          { label: client.fullName },
        ]}
        title={client.fullName}
        subtitle={`${t("signedAt")}: ${formatSalesDateTime(client.signedAt)}`}
        meta={
          <>
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
          </>
        }
        actions={
          client.campaignName ? <StatusBadge label={client.campaignName} tone="blue" /> : null
        }
      />

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      {health ? (
        <article className="so-card">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="crm-section-title mb-0">{t("health.title")}</h2>
            <ClientHealthBadge status={health.status} score={health.score} />
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-sm">
            <span className="text-[var(--so-muted)]">
              {t("health.lastTrip")}:{" "}
              <span className="font-semibold text-[var(--so-text)]">
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
                    className="inline-flex rounded-full bg-[var(--so-surface-2)] px-2 py-0.5 text-[0.7rem] font-medium text-[var(--so-muted)]"
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
        <article className="so-card">
          <h2 className="crm-section-title mb-3">{t("clientDetails")}</h2>
          <dl className="grid gap-2 text-sm">
            <div>
              <dt className="crm-label">{t("field.email")}</dt>
              <dd className="text-[var(--so-text)]">{client.email ?? "—"}</dd>
            </div>
            <div>
              <dt className="crm-label">{t("field.phone")}</dt>
              <dd className="text-[var(--so-text)]">{client.phone ?? "—"}</dd>
            </div>
            <div>
              <dt className="crm-label">{t("field.company")}</dt>
              <dd className="text-[var(--so-text)]">{client.companyName ?? "—"}</dd>
            </div>
            <div>
              <dt className="crm-label">{t("field.corpClient")}</dt>
              <dd className="text-[var(--so-text)]">
                {client.corpClientName ?? client.corpClientId ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="crm-label">{t("manager.accountManager")}</dt>
              <dd className="text-[var(--so-text)]">{client.accountManagerName ?? "—"}</dd>
            </div>
            <div>
              <dt className="crm-label">{t("manager.salesManager")}</dt>
              <dd className="text-[var(--so-text)]">
                {client.salesManagerName ?? client.pendingSalesManagerName ?? "—"}
              </dd>
            </div>
          </dl>
          {!client.corpClientId ? (
            <p className="mt-3 text-xs text-[var(--so-muted)]">{t("client.linkB2BHint")}</p>
          ) : null}
        </article>

        <article className="so-card">
          <h2 className="crm-section-title mb-3">{t("manager.editManagers")}</h2>
          <SalesClientManagerFields
            users={users}
            registry={registry}
            draft={draft}
            onChange={setDraft}
            pendingSalesManagerName={client.pendingSalesManagerName}
            assignedSalesManagerName={client.salesManagerName}
          />
          <Button
            className="mt-3"
            loading={saving}
            disabled={saving}
            onClick={() => void saveManagers()}
          >
            {t("saveLead")}
          </Button>
        </article>
      </div>

      <article className="so-card">
        <h2 className="crm-section-title mb-3">{t("notes")}</h2>
        {notes.length === 0 ? (
          <p className="text-sm text-[var(--so-muted)]">{t("noNotes")}</p>
        ) : (
          <div className="space-y-2">
            {notes.map((note) => (
              <div
                key={note.id}
                className="rounded-[12px] border border-[var(--so-border)] bg-[var(--so-surface-2)] px-3 py-2"
              >
                <p className="text-xs text-[var(--so-muted)]">
                  {note.authorName} · {formatSalesDateTime(note.createdAt)}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--so-text)]">{note.body}</p>
              </div>
            ))}
          </div>
        )}
      </article>

      {client.corpClientId ? (
        <>
          <article className="so-card">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <h2 className="crm-section-title mb-0">{t("client.b2bPerformance")}</h2>
              <div className="flex flex-wrap items-end gap-2">
                <label className="text-xs text-[var(--so-muted)]">
                  {t("manager.from")}
                  <input
                    type="date"
                    value={range.from}
                    onChange={(event) => setRange((prev) => ({ ...prev, from: event.target.value }))}
                    className="crm-input mt-1 block h-9 px-2.5 text-sm"
                  />
                </label>
                <label className="text-xs text-[var(--so-muted)]">
                  {t("manager.to")}
                  <input
                    type="date"
                    value={range.to}
                    onChange={(event) => setRange((prev) => ({ ...prev, to: event.target.value }))}
                    className="crm-input mt-1 block h-9 px-2.5 text-sm"
                  />
                </label>
                <Button variant="secondary" onClick={() => void loadDetail()}>
                  {t("manager.refresh")}
                </Button>
              </div>
            </div>
            {metrics ? (
              <div className="grid gap-3 md:grid-cols-4">
                <StatTile label={t("manager.requests")} value={metrics.requests.toLocaleString("en-US")} />
                <StatTile label={t("manager.trips")} value={metrics.trips.toLocaleString("en-US")} />
                <StatTile label={t("manager.gmv")} value={formatMoney(metrics.gmv)} />
                <StatTile
                  label={t("manager.decouplingRate")}
                  value={formatPercent(metrics.decouplingRate)}
                />
              </div>
            ) : (
              <p className="text-sm text-[var(--so-muted)]">{t("client.noB2BMetrics")}</p>
            )}
          </article>

          <article className="so-card">
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
              <p className="text-sm text-[var(--so-muted)]">{t("client.noTripsInRange")}</p>
            ) : (
              <div className="overflow-auto rounded-[12px] border border-[var(--so-border)]">
                <table className="min-w-full text-xs">
                  <thead className="bg-[var(--so-surface-2)] text-[var(--so-muted)]">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">{t("client.tripDate")}</th>
                      <th className="px-3 py-2 text-left font-semibold">{t("client.orderId")}</th>
                      <th className="px-3 py-2 text-right font-semibold">{t("manager.gmv")}</th>
                      <th className="px-3 py-2 text-right font-semibold">{t("manager.decoupling")}</th>
                      <th className="px-3 py-2 text-left font-semibold">{t("field.status")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--so-border)]">
                    {trips.map((trip) => (
                      <tr key={trip.orderId} className="transition-colors hover:bg-[var(--so-surface-hover)]">
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
        <article className="rounded-[16px] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {t("client.linkB2BHint")}
        </article>
      )}
    </section>
  );
}
