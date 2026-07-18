"use client";

import { DataTable } from "@/components/ui/DataTable";
import type { YangoSupabaseOrderMetric } from "@/types/crm";

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

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 2,
  }).format(value);
}

function getStatusLabel(statusRaw: string, successOrderFlag: boolean | null): string {
  if (successOrderFlag === true) return "Completed";
  const trimmed = statusRaw.trim();
  return trimmed.length > 0 ? trimmed : "Unknown";
}

function statusTone(statusRaw: string, successOrderFlag: boolean | null): string {
  if (successOrderFlag === true) return "bg-emerald-50 text-emerald-700";
  if (statusRaw.toLowerCase().includes("cancel")) return "bg-rose-50 text-rose-700";
  return "bg-amber-50 text-amber-700";
}

export function TripsTable({ rows }: { rows: YangoSupabaseOrderMetric[] }) {
  return (
    <DataTable
      rows={rows}
      getRowKey={(row) => row.orderId}
      searchable
      getSearchText={(row) => `${row.orderId} ${row.statusRaw}`}
      pageSize={25}
      labels={{ empty: "No trips found for this client in the selected period." }}
      columns={[
        {
          key: "date",
          header: "Trip date",
          sortable: true,
          sortValue: (row) => row.scheduledAt,
          render: (row) => (
            <span className="text-[var(--so-text)]">{formatDateTime(row.scheduledAt)}</span>
          ),
        },
        {
          key: "order",
          header: "Order",
          render: (row) => (
            <a
              href={`https://go-admin-frontend.taxi.yandex-team.ru/orders/${encodeURIComponent(row.orderId)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-[var(--so-text)] transition-colors hover:text-[var(--so-accent-strong)]"
            >
              {row.orderId}
            </a>
          ),
        },
        {
          key: "status",
          header: "Status",
          render: (row) => (
            <span
              className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${statusTone(row.statusRaw, row.successOrderFlag)}`}
            >
              {getStatusLabel(row.statusRaw, row.successOrderFlag)}
            </span>
          ),
        },
        {
          key: "clientPaid",
          header: "Client paid",
          align: "right",
          sortable: true,
          sortValue: (row) => row.clientPaid,
          render: (row) => formatMoney(row.clientPaid),
        },
        {
          key: "driverReceived",
          header: "Driver received",
          align: "right",
          sortable: true,
          sortValue: (row) => row.driverReceived,
          render: (row) => formatMoney(row.driverReceived),
        },
        {
          key: "decoupling",
          header: "Decoupling",
          align: "right",
          sortable: true,
          sortValue: (row) => row.decoupling,
          render: (row) => formatMoney(row.decoupling),
        },
        {
          key: "flag",
          header: "Flag",
          align: "center",
          render: (row) =>
            row.decouplingFlg === null ? "n/a" : row.decouplingFlg ? "Yes" : "No",
        },
      ]}
    />
  );
}
