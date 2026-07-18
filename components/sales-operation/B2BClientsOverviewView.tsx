"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { B2BPreOrdersPanel } from "@/components/dashboard/B2BPreOrdersPanel";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { dataTableLabels } from "@/lib/ui/data-table-labels";
import { formatSalesDateTime } from "@/lib/sales-operation/display";
import type { SalesClientListRow } from "@/lib/sales-operation/client-list";
import type { B2BClientRegistryEntry } from "@/lib/sales-operation/manager-types";
import type { YangoSupabaseOrderMetric } from "@/types/crm";

type B2BClientsOverviewViewProps = {
  yangoRows: YangoSupabaseOrderMetric[];
  corpClientNameMap: Record<string, string>;
};

export function B2BClientsOverviewView({
  yangoRows,
  corpClientNameMap,
}: B2BClientsOverviewViewProps) {
  const t = useTranslations("salesOperation");
  const [registry, setRegistry] = useState<B2BClientRegistryEntry[]>([]);
  const [clientRows, setClientRows] = useState<SalesClientListRow[]>([]);

  const loadRegistry = useCallback(async () => {
    try {
      const res = await fetch("/api/sales-operation/b2b-clients/registry", { cache: "no-store" });
      const data = (await res.json()) as { ok?: boolean; registry?: B2BClientRegistryEntry[] };
      if (res.ok && data.ok) {
        setRegistry(data.registry ?? []);
      }
    } catch {
      setRegistry([]);
    }
  }, []);

  const loadClients = useCallback(async () => {
    try {
      const res = await fetch("/api/sales-operation/clients", { cache: "no-store" });
      const data = (await res.json()) as { ok?: boolean; rows?: SalesClientListRow[] };
      if (res.ok && data.ok) {
        setClientRows(data.rows ?? []);
      }
    } catch {
      setClientRows([]);
    }
  }, []);

  useEffect(() => {
    void loadRegistry();
    void loadClients();
  }, [loadRegistry, loadClients]);

  const awaitingLinkRows = useMemo(
    () => clientRows.filter((row) => row.source === "signed"),
    [clientRows],
  );

  return (
    <>
      <B2BPreOrdersPanel
        rows={[]}
        yangoRows={yangoRows}
        corpClientNameMap={corpClientNameMap}
        b2bClientRegistry={registry}
        onB2BRegistryUpdated={loadRegistry}
        view="b2bClientsOverview"
      />

      {awaitingLinkRows.length > 0 ? (
        <section className="crm-page pt-0">
          <h2 className="crm-section-title mb-3">{t("signedAwaitingLinkTitle")}</h2>
          <DataTable
            rows={awaitingLinkRows}
            getRowKey={(row) => row.key}
            searchable={awaitingLinkRows.length > 8}
            getSearchText={(row) => `${row.name} ${row.companyName ?? ""} ${row.salesManagerName ?? ""}`}
            labels={dataTableLabels(t)}
            columns={[
              {
                key: "name",
                header: t("field.fullName"),
                sortable: true,
                sortValue: (row) => row.name,
                render: (row) => (
                  <div className="min-w-[240px]">
                    {row.salesClientId ? (
                      <Link
                        href={`/sales-operation/b2b-clients/${row.salesClientId}`}
                        className="font-semibold text-[var(--so-text)] underline-offset-2 hover:underline"
                      >
                        {row.name}
                      </Link>
                    ) : (
                      <span className="font-semibold text-[var(--so-text)]">{row.name}</span>
                    )}
                    <span className="mt-0.5 block text-xs font-medium text-[color:var(--accent-strong)]">
                      {t("clientsNeedsB2bLink")}
                    </span>
                  </div>
                ),
              },
              {
                key: "company",
                header: t("field.company"),
                sortable: true,
                sortValue: (row) => row.companyName ?? "",
                render: (row) => row.companyName ?? "—",
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
                    <span className="text-[var(--so-muted)]">—</span>
                  ),
              },
              {
                key: "signed",
                header: t("signedAt"),
                sortable: true,
                sortValue: (row) => row.signedAt ?? "",
                render: (row) => (row.signedAt ? formatSalesDateTime(row.signedAt) : "—"),
              },
            ]}
          />
        </section>
      ) : null}
    </>
  );
}
