"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/components/auth/AuthProvider";
import { Table } from "@/components/ui/Table";
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
    <section className="crm-page">
      <div className="mb-4 grid gap-3 rounded-3xl border border-white/70 bg-white/70 p-4 md:grid-cols-2 lg:grid-cols-5">
        <label className="text-xs text-muted">
          {t("manager.role")}
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as "account" | "sales")}
            className="crm-input mt-1 block h-9 w-full px-2.5 text-sm text-slate-700"
          >
            <option value="account">{t("manager.accountManager")}</option>
            <option value="sales">{t("manager.salesManager")}</option>
          </select>
        </label>
        <label className="text-xs text-muted">
          {t("manager.manager")}
          <select
            value={managerUserId}
            onChange={(event) => setManagerUserId(event.target.value)}
            className="crm-input mt-1 block h-9 w-full px-2.5 text-sm text-slate-700"
          >
            {managerOptions.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name} ({user.role})
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted">
          {t("manager.from")}
          <input
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className="crm-input mt-1 block h-9 w-full px-2.5 text-sm text-slate-700"
          />
        </label>
        <label className="text-xs text-muted">
          {t("manager.to")}
          <input
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className="crm-input mt-1 block h-9 w-full px-2.5 text-sm text-slate-700"
          />
        </label>
        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={() => void loadSummary()}
            disabled={loading}
            className="crm-button-primary h-9 rounded-xl px-4 text-sm font-semibold disabled:opacity-60"
          >
            {loading ? t("loading") : t("manager.refresh")}
          </button>
          <button
            type="button"
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
            className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            {t("report.exportCsv")}
          </button>
        </div>
      </div>

      {error ? <p className="mb-3 text-sm text-rose-700">{error}</p> : null}

      {summary ? (
        <>
          <div className="mb-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <article className="rounded-2xl border border-border bg-white/80 p-4">
              <p className="text-sm text-muted">{t("manager.clientCount")}</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">{summary.clientCount}</p>
            </article>
            <article className="rounded-2xl border border-border bg-white/80 p-4">
              <p className="text-sm text-muted">{t("manager.trips")}</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">
                {summary.trips.toLocaleString("en-US")}
              </p>
            </article>
            <article className="rounded-2xl border border-border bg-white/80 p-4">
              <p className="text-sm text-muted">{t("manager.gmv")}</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">{formatMoney(summary.gmv)}</p>
            </article>
            <article className="rounded-2xl border border-border bg-white/80 p-4">
              <p className="text-sm text-muted">{t("manager.decouplingRate")}</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">
                {formatPercent(summary.decouplingRate)}
              </p>
            </article>
          </div>

          <Table
            emptyText={t("manager.noClients")}
            rows={summary.clients}
            columns={[
              {
                key: "client",
                header: t("field.company"),
                render: (row) => (
                  <div>
                    <p className="font-semibold text-slate-900">{row.clientName}</p>
                    <p className="text-xs text-muted">{row.corpClientId}</p>
                  </div>
                ),
              },
              {
                key: "requests",
                header: t("manager.requests"),
                render: (row) => row.requests.toLocaleString("en-US"),
              },
              {
                key: "trips",
                header: t("manager.trips"),
                render: (row) => row.trips.toLocaleString("en-US"),
              },
              {
                key: "gmv",
                header: t("manager.gmv"),
                render: (row) => formatMoney(row.gmv),
              },
              {
                key: "decoupling",
                header: t("manager.decoupling"),
                render: (row) => formatMoney(row.decoupling),
              },
              {
                key: "rate",
                header: t("manager.decouplingRate"),
                render: (row) => formatPercent(row.decouplingRate),
              },
            ]}
          />
        </>
      ) : loading ? (
        <p className="text-sm text-muted">{t("loading")}</p>
      ) : null}
    </section>
  );
}
