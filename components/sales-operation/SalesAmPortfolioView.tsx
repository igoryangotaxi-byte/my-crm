"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ClientHealthBadge } from "@/components/sales-operation/ClientHealthBadge";
import type { AmPortfolioGroup } from "@/lib/sales-operation/am-portfolio";
import type { ClientHealthStatus } from "@/lib/sales-operation/client-health";

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(value);
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

const HEALTH_ORDER: ClientHealthStatus[] = ["healthy", "new", "watch", "at_risk", "dormant"];

export function SalesAmPortfolioView() {
  const t = useTranslations("salesOperation");
  const [groups, setGroups] = useState<AmPortfolioGroup[]>([]);
  const [range, setRange] = useState(defaultRange);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ from: range.from, to: range.to });
      const res = await fetch(`/api/sales-operation/portfolio?${params.toString()}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as {
        ok?: boolean;
        groups?: AmPortfolioGroup[];
        error?: string;
      };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed to load portfolio.");
      setGroups(data.groups ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load portfolio.");
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="crm-page space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t("portfolio.title")}</h1>
          <p className="text-sm text-muted">{t("portfolio.subtitle")}</p>
        </div>
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
            onClick={() => void load()}
            className="crm-button-primary h-9 rounded-lg px-3 text-sm font-semibold"
          >
            {t("manager.refresh")}
          </button>
        </div>
      </div>

      {error ? <p className="text-sm text-rose-700">{error}</p> : null}

      {loading && groups.length === 0 ? (
        <p className="text-sm text-muted">{t("loading")}</p>
      ) : groups.length === 0 ? (
        <p className="text-sm text-muted">{t("portfolio.empty")}</p>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <article
              key={group.accountManagerUserId ?? "unassigned"}
              className="rounded-3xl border border-white/70 bg-white/70 p-4"
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    {group.accountManagerName ?? t("portfolio.unassigned")}
                  </h2>
                  <p className="text-xs text-muted">
                    {t("portfolio.clientCount", { count: group.clientCount })} ·{" "}
                    {formatMoney(group.totalGmv)} · {group.totalTrips.toLocaleString("en-US")}{" "}
                    {t("manager.trips").toLowerCase()}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {HEALTH_ORDER.filter((status) => group.healthCounts[status] > 0).map((status) => (
                    <span
                      key={status}
                      className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-[0.68rem] font-semibold text-slate-700"
                    >
                      {t(`health.status.${status}`)}: {group.healthCounts[status]}
                    </span>
                  ))}
                </div>
              </div>
              <div className="overflow-auto rounded-2xl border border-border/70">
                <table className="min-w-full text-xs">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-3 py-2 text-left">{t("portfolio.colClient")}</th>
                      <th className="px-3 py-2 text-left">{t("portfolio.colHealth")}</th>
                      <th className="px-3 py-2 text-right">{t("manager.trips")}</th>
                      <th className="px-3 py-2 text-right">{t("manager.gmv")}</th>
                      <th className="px-3 py-2 text-right">{t("portfolio.colLastTrip")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/70">
                    {group.clients.map((client) => (
                      <tr key={client.key}>
                        <td className="px-3 py-2">
                          {client.salesClientId ? (
                            <Link
                              href={`/sales-operation/clients/${client.salesClientId}`}
                              className="font-semibold text-accent hover:underline"
                            >
                              {client.name}
                            </Link>
                          ) : (
                            <span className="font-semibold text-slate-800">{client.name}</span>
                          )}
                          {client.companyName && client.companyName !== client.name ? (
                            <span className="block text-[0.68rem] text-muted">
                              {client.companyName}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2">
                          <ClientHealthBadge
                            status={client.health.status}
                            score={client.health.score}
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          {(client.metrics?.trips ?? 0).toLocaleString("en-US")}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {formatMoney(client.metrics?.gmv ?? 0)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {client.health.daysSinceLastTrip === null
                            ? "—"
                            : t("portfolio.daysAgo", { days: client.health.daysSinceLastTrip })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
