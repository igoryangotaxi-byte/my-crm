"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Table } from "@/components/ui/Table";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  filterSalesClientListRows,
  type SalesClientListRow,
} from "@/lib/sales-operation/client-list";
import { formatSalesDateTime } from "@/lib/sales-operation/display";

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
  const [rows, setRows] = useState<SalesClientListRow[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      const params = new URLSearchParams({
        corpClientId: row.corpClientId,
        from: range.from,
        to: range.to,
        clientName: row.name,
      });
      router.push(`/dashboard/yango-client-trips?${params.toString()}`);
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
              <button
                type="button"
                onClick={() => openRow(row)}
                className="text-left font-semibold text-slate-900 underline-offset-2 hover:underline"
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
