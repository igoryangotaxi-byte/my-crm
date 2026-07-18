"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ClientHealthBadge } from "@/components/sales-operation/ClientHealthBadge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { Briefcase } from "lucide-react";
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
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-[14px] border border-[var(--so-border)] bg-[var(--so-surface)] px-3.5 py-3 shadow-[var(--so-shadow-xs)]">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span className="font-semibold text-[var(--so-text)]">
            {t("portfolio.clientCount", {
              count: groups.reduce((sum, group) => sum + group.clientCount, 0),
            })}
          </span>
          <span className="text-[var(--so-muted-2)]">·</span>
          <span className="text-[var(--so-muted)]">
            {groups.length} {t("portfolio.groupsLabel")}
          </span>
        </div>
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
          <Button loading={loading} disabled={loading} onClick={() => void load()}>
            {t("manager.refresh")}
          </Button>
        </div>
      </div>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      {loading && groups.length === 0 ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <SkeletonCard key={i} className="h-40" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div className="so-card">
          <EmptyState icon={<Briefcase className="h-5 w-5" />} title={t("portfolio.empty")} />
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <article
              key={group.accountManagerUserId ?? "unassigned"}
              className="rounded-[16px] border border-[var(--so-border)] bg-[var(--so-surface)] p-4 shadow-[var(--so-shadow-sm)]"
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-lg font-bold tracking-tight text-[var(--so-text)]">
                    {group.accountManagerName ?? t("portfolio.unassigned")}
                  </h2>
                  <p className="text-xs text-[var(--so-muted)]">
                    {t("portfolio.clientCount", { count: group.clientCount })} ·{" "}
                    {formatMoney(group.totalGmv)} · {group.totalTrips.toLocaleString("en-US")}{" "}
                    {t("manager.trips").toLowerCase()}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {HEALTH_ORDER.filter((status) => group.healthCounts[status] > 0).map((status) => (
                    <span
                      key={status}
                      className="inline-flex items-center gap-1 rounded-full bg-[var(--so-surface-2)] px-2 py-0.5 text-[0.68rem] font-semibold text-[var(--so-muted)]"
                    >
                      {t(`health.status.${status}`)}: {group.healthCounts[status]}
                    </span>
                  ))}
                </div>
              </div>
              <div className="overflow-auto rounded-[12px] border border-[var(--so-border)]">
                <table className="min-w-full text-xs">
                  <thead className="bg-[var(--so-surface-2)] text-[var(--so-muted)]">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">{t("portfolio.colClient")}</th>
                      <th className="px-3 py-2 text-left font-semibold">{t("portfolio.colHealth")}</th>
                      <th className="px-3 py-2 text-right font-semibold">{t("manager.trips")}</th>
                      <th className="px-3 py-2 text-right font-semibold">{t("manager.gmv")}</th>
                      <th className="px-3 py-2 text-right font-semibold">{t("portfolio.colLastTrip")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--so-border)]">
                    {group.clients.map((client) => (
                      <tr key={client.key} className="transition-colors hover:bg-[var(--so-surface-hover)]">
                        <td className="px-3 py-2">
                          {client.salesClientId ? (
                            <Link
                              href={`/sales-operation/b2b-clients/${client.salesClientId}`}
                              className="font-semibold text-accent hover:underline"
                            >
                              {client.name}
                            </Link>
                          ) : (
                            <span className="font-semibold text-[var(--so-text)]">{client.name}</span>
                          )}
                          {client.companyName && client.companyName !== client.name ? (
                            <span className="block text-[0.68rem] text-[var(--so-muted)]">
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
