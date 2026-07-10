"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/components/auth/AuthProvider";
import { Table } from "@/components/ui/Table";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  filterSalesClientListRows,
  type SalesClientListRow,
} from "@/lib/sales-operation/client-list";
import { buildSalesOperationB2BClientTripsHref } from "@/lib/sales-operation/b2b-client-trips-href";
import { getAccountManagerUserOptions } from "@/lib/sales-operation/crm-manager-users";
import { formatSalesDateTime } from "@/lib/sales-operation/display";
import type { B2BClientRegistryEntry } from "@/lib/sales-operation/manager-types";

function defaultTripsRange() {
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

export function SalesClientsView() {
  const t = useTranslations("salesOperation");
  const router = useRouter();
  const { users } = useAuth();
  const [rows, setRows] = useState<SalesClientListRow[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const accountOptions = useMemo(() => getAccountManagerUserOptions(users), [users]);

  const loadClients = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const clientsRes = await fetch("/api/sales-operation/clients", { cache: "no-store" });
      const clientsData = (await clientsRes.json()) as {
        ok?: boolean;
        rows?: SalesClientListRow[];
        error?: string;
      };
      if (!clientsRes.ok || !clientsData.ok) {
        throw new Error(clientsData.error ?? "Failed to load clients.");
      }
      setRows(clientsData.rows ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load clients.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadClients();
  }, [loadClients]);

  const filteredRows = useMemo(() => filterSalesClientListRows(rows, query), [rows, query]);

  const openRow = (row: SalesClientListRow) => {
    if (row.salesClientId) {
      router.push(`/sales-operation/clients/${row.salesClientId}`);
      return;
    }
    if (row.corpClientId) {
      const range = defaultTripsRange();
      router.push(
        buildSalesOperationB2BClientTripsHref({
          corpClientId: row.corpClientId,
          clientName: row.name,
          from: range.from,
          to: range.to,
        }),
      );
    }
  };

  const assignAccountManager = async (row: SalesClientListRow, accountManagerUserId: string) => {
    if (!row.corpClientId) return;
    const previousUserId = row.accountManagerUserId;
    const previousName = row.accountManagerName;
    const nextName =
      accountOptions.find((user) => user.id === accountManagerUserId)?.name ?? null;

    setSavingKey(row.key);
    setError(null);
    setRows((prev) =>
      prev.map((item) =>
        item.key === row.key
          ? {
              ...item,
              accountManagerUserId: accountManagerUserId || null,
              accountManagerName: accountManagerUserId ? nextName : null,
            }
          : item,
      ),
    );

    try {
      const res = await fetch(
        `/api/sales-operation/b2b-clients/${encodeURIComponent(row.corpClientId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accountManagerUserId: accountManagerUserId || null,
          }),
        },
      );
      const data = (await res.json()) as {
        ok?: boolean;
        entry?: B2BClientRegistryEntry;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.entry) {
        throw new Error(data.error ?? "Failed to assign account manager.");
      }
      setRows((prev) =>
        prev.map((item) =>
          item.key === row.key
            ? {
                ...item,
                accountManagerUserId: data.entry?.accountManager.userId ?? null,
                accountManagerName: data.entry?.accountManager.name ?? null,
              }
            : item,
        ),
      );
    } catch (err) {
      setRows((prev) =>
        prev.map((item) =>
          item.key === row.key
            ? {
                ...item,
                accountManagerUserId: previousUserId,
                accountManagerName: previousName,
              }
            : item,
        ),
      );
      setError(err instanceof Error ? err.message : "Failed to assign account manager.");
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <section className="crm-page">
      {error ? <p className="mb-3 text-sm text-rose-700">{error}</p> : null}
      {loading ? <p className="mb-3 text-sm text-muted">{t("loading")}</p> : null}

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="min-w-[240px] flex-1 text-sm">
          <span className="crm-label">{t("clientsSearchLabel")}</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("clientsSearchPlaceholder")}
            className="crm-input mt-1 block h-9 w-full px-2.5 text-sm text-slate-700"
            autoComplete="off"
          />
        </label>
        <p className="pb-2 text-xs text-muted">
          {t("clientsCount", { count: filteredRows.length, total: rows.length })}
        </p>
      </div>

      <Table
        emptyText={query.trim() ? t("clientsNoMatch") : t("noClients")}
        rows={filteredRows}
        getRowKey={(row) => row.key}
        getRowClassName={(row) =>
          row.source === "signed"
            ? "bg-[color-mix(in_srgb,var(--brand)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--brand)_16%,transparent)]"
            : undefined
        }
        columns={[
          {
            key: "name",
            header: t("field.fullName"),
            render: (row) => (
              <div className="flex min-w-[280px] items-start justify-between gap-3">
                <button
                  type="button"
                  onClick={() => openRow(row)}
                  className="min-w-0 flex-1 text-left font-semibold text-slate-900 underline-offset-2 hover:underline"
                >
                  <span className="block">{row.name}</span>
                  {row.source === "signed" ? (
                    <span className="mt-0.5 block text-xs font-medium text-[color:var(--accent-strong)]">
                      {t("clientsNeedsB2bLink")}
                    </span>
                  ) : null}
                  {row.corpClientId ? (
                    <span className="mt-0.5 block break-all text-xs font-normal text-slate-500">
                      {row.corpClientId}
                    </span>
                  ) : null}
                </button>
                <label className="shrink-0 text-left">
                  <span className="sr-only">{t("manager.accountManager")}</span>
                  <select
                    value={row.accountManagerUserId ?? ""}
                    disabled={!row.corpClientId || savingKey === row.key}
                    title={
                      row.corpClientId
                        ? t("manager.accountManager")
                        : t("clientsNeedsB2bLink")
                    }
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => {
                      void assignAccountManager(row, event.target.value);
                    }}
                    className="crm-input h-8 max-w-[160px] px-2 text-xs text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <option value="">{t("manager.unassigned")}</option>
                    {accountOptions.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ),
          },
          {
            key: "company",
            header: t("field.company"),
            render: (row) => row.companyName ?? "—",
          },
          {
            key: "corpClient",
            header: t("field.corpClient"),
            render: (row) =>
              row.corpClientId ? (
                <span className="break-all text-xs text-slate-700">{row.corpClientId}</span>
              ) : (
                "—"
              ),
          },
          {
            key: "accountManager",
            header: t("manager.accountManager"),
            render: (row) => row.accountManagerName ?? "—",
          },
          {
            key: "salesManager",
            header: t("manager.salesManager"),
            render: (row) => row.salesManagerName ?? "—",
          },
          {
            key: "campaign",
            header: t("field.campaign"),
            render: (row) =>
              row.campaignName ? (
                <StatusBadge label={row.campaignName} tone="blue" />
              ) : (
                <span className="text-muted">—</span>
              ),
          },
          {
            key: "signed",
            header: t("signedAt"),
            render: (row) => (row.signedAt ? formatSalesDateTime(row.signedAt) : "—"),
          },
        ]}
      />
    </section>
  );
}
