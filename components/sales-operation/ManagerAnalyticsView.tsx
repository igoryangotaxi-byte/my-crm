"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Download } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { DataTable } from "@/components/ui/DataTable";
import { StatTile } from "@/components/ui/StatTile";
import { Button } from "@/components/ui/Button";
import { dataTableLabels } from "@/lib/ui/data-table-labels";
import { getManagerUserOptionsForRole } from "@/lib/sales-operation/crm-manager-users";
import { rowsToCsv } from "@/lib/sales-operation/analytics";
import type { ManagerPortfolioSummary } from "@/lib/sales-operation/manager-types";

function downloadCsv(filename: string, rows: Array<Array<unknown>>) {
  const blob = new Blob([`\ufeff${rowsToCsv(rows)}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function toDateInputValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

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

export function ManagerAnalyticsView() {
  const t = useTranslations("salesOperation");
  const { users } = useAuth();
  const [role, setRole] = useState<"account" | "sales">("account");
  const [managerUserId, setManagerUserId] = useState("");
  const [from, setFrom] = useState(() => {
    const date = new Date();
    return toDateInputValue(new Date(date.getFullYear(), date.getMonth(), 1));
  });
  const [to, setTo] = useState(() => toDateInputValue(new Date()));
  const [summary, setSummary] = useState<ManagerPortfolioSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const managerOptions = useMemo(
    () => getManagerUserOptionsForRole(users, role),
    [users, role],
  );

  useEffect(() => {
    setManagerUserId("");
  }, [role]);

  useEffect(() => {
    if (!managerUserId && managerOptions.length > 0) {
      setManagerUserId(managerOptions[0]?.id ?? "");
    }
  }, [managerOptions, managerUserId]);

  const loadSummary = useCallback(async () => {
    if (!managerUserId || !from || !to) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        managerUserId,
        role,
        from,
        to,
      });
      const res = await fetch(`/api/sales-operation/analytics/managers?${params.toString()}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as {
        ok?: boolean;
        summary?: ManagerPortfolioSummary;
        error?: string;
      };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed to load manager analytics.");
      setSummary(data.summary ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load manager analytics.");
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [from, managerUserId, role, to]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  return (
    <>
      <section className="crm-page">
      <div className="mb-4 grid gap-3 rounded-[16px] border border-[var(--so-border)] bg-[var(--so-surface)] p-4 shadow-[var(--so-shadow-sm)] md:grid-cols-2 lg:grid-cols-5">
        <label className="text-xs text-[var(--so-muted)]">
          {t("manager.role")}
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as "account" | "sales")}
            className="crm-input mt-1 block h-9 w-full px-2.5 text-sm"
          >
            <option value="account">{t("manager.accountManager")}</option>
            <option value="sales">{t("manager.salesManager")}</option>
          </select>
        </label>
        <label className="text-xs text-[var(--so-muted)]">
          {t("manager.manager")}
          <select
            value={managerUserId}
            onChange={(event) => setManagerUserId(event.target.value)}
            className="crm-input mt-1 block h-9 w-full px-2.5 text-sm"
          >
            {managerOptions.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name} ({user.role})
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-[var(--so-muted)]">
          {t("manager.from")}
          <input
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className="crm-input mt-1 block h-9 w-full px-2.5 text-sm"
          />
        </label>
        <label className="text-xs text-[var(--so-muted)]">
          {t("manager.to")}
          <input
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className="crm-input mt-1 block h-9 w-full px-2.5 text-sm"
          />
        </label>
        <div className="flex items-end gap-2">
          <Button loading={loading} disabled={loading} onClick={() => void loadSummary()}>
            {t("manager.refresh")}
          </Button>
          <Button
            variant="secondary"
            leftIcon={<Download className="h-4 w-4" />}
            onClick={() =>
              summary &&
              downloadCsv(`manager-${summary.managerName || summary.managerUserId}.csv`, [
                [
                  t("field.company"),
                  t("manager.requests"),
                  t("manager.trips"),
                  t("manager.gmv"),
                  t("manager.decoupling"),
                  t("manager.decouplingRate"),
                ],
                ...summary.clients.map((row) => [
                  row.clientName,
                  row.requests,
                  row.trips,
                  Math.round(row.gmv),
                  Math.round(row.decoupling),
                  `${row.decouplingRate.toFixed(1)}%`,
                ]),
              ])
            }
            disabled={!summary || summary.clients.length === 0}
          >
            {t("report.exportCsv")}
          </Button>
        </div>
      </div>

      {error ? <p className="mb-3 text-sm text-rose-600">{error}</p> : null}

      {summary ? (
        <>
          <div className="mb-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <StatTile label={t("manager.clientCount")} value={summary.clientCount} />
            <StatTile label={t("manager.trips")} value={summary.trips.toLocaleString("en-US")} />
            <StatTile label={t("manager.gmv")} value={formatMoney(summary.gmv)} />
            <StatTile label={t("manager.decouplingRate")} value={formatPercent(summary.decouplingRate)} />
          </div>

          <DataTable
            rows={summary.clients}
            getRowKey={(row) => `${row.corpClientId}-${row.clientName}`}
            searchable
            getSearchText={(row) => `${row.clientName} ${row.corpClientId}`}
            pageSize={20}
            labels={dataTableLabels(t, { empty: t("manager.noClients") })}
            columns={[
              {
                key: "client",
                header: t("field.company"),
                sortable: true,
                sortValue: (row) => row.clientName,
                render: (row) => (
                  <div>
                    <p className="font-semibold text-[var(--so-text)]">{row.clientName}</p>
                    <p className="text-xs text-[var(--so-muted)]">{row.corpClientId}</p>
                  </div>
                ),
              },
              {
                key: "requests",
                header: t("manager.requests"),
                align: "right",
                sortable: true,
                sortValue: (row) => row.requests,
                render: (row) => row.requests.toLocaleString("en-US"),
              },
              {
                key: "trips",
                header: t("manager.trips"),
                align: "right",
                sortable: true,
                sortValue: (row) => row.trips,
                render: (row) => row.trips.toLocaleString("en-US"),
              },
              {
                key: "gmv",
                header: t("manager.gmv"),
                align: "right",
                sortable: true,
                sortValue: (row) => row.gmv,
                render: (row) => formatMoney(row.gmv),
              },
              {
                key: "decoupling",
                header: t("manager.decoupling"),
                align: "right",
                sortable: true,
                sortValue: (row) => row.decoupling,
                render: (row) => formatMoney(row.decoupling),
              },
              {
                key: "rate",
                header: t("manager.decouplingRate"),
                align: "right",
                sortable: true,
                sortValue: (row) => row.decouplingRate,
                render: (row) => formatPercent(row.decouplingRate),
              },
            ]}
          />
        </>
      ) : loading ? (
        <p className="text-sm text-[var(--so-muted)]">{t("loading")}</p>
      ) : null}
      </section>
    </>
  );
}
