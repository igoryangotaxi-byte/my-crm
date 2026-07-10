import Link from "next/link";
import { PageHeading } from "@/components/ui/PageHeading";
import { getYangoSupabaseOrderMetricsForRange } from "@/lib/yango-supabase";

export const dynamic = "force-dynamic";

type SalesOperationB2BClientTripsPageProps = {
  searchParams: Promise<{
    corpClientId?: string | string[];
    clientName?: string | string[];
    from?: string | string[];
    to?: string | string[];
  }>;
};

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function normalizeCorpClientId(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeDateInput(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function formatDateLabel(value: string): string {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsed);
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

function getStatusTone(statusRaw: string, successOrderFlag: boolean | null): string {
  if (successOrderFlag === true) return "bg-emerald-50 text-emerald-700";
  if (statusRaw.toLowerCase().includes("cancel")) return "bg-rose-50 text-rose-700";
  return "bg-amber-50 text-amber-700";
}

export default async function SalesOperationB2BClientTripsPage({
  searchParams,
}: SalesOperationB2BClientTripsPageProps) {
  const params = await searchParams;
  const corpClientId = normalizeCorpClientId(firstParam(params.corpClientId));
  const requestedClientName = firstParam(params.clientName).trim();
  const fromDate = normalizeDateInput(firstParam(params.from));
  const toDate = normalizeDateInput(firstParam(params.to));
  const isValidRequest = corpClientId.length > 0 && fromDate && toDate && fromDate <= toDate;

  if (!isValidRequest) {
    return (
      <section className="crm-page relative">
        <div className="mb-3">
          <Link href="/sales-operation/b2b-clients" className="text-sm font-medium text-accent hover:underline">
            ← Back to B2B Clients Overview
          </Link>
        </div>
        <PageHeading
          title="B2B client trips"
          subtitle="Open this page from Sales Operation → B2B Clients Overview to pass the client and selected period."
        />
        <section className="glass-surface rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Missing or invalid `corpClientId`, `from`, or `to` query parameters.
        </section>
      </section>
    );
  }

  const rows = await getYangoSupabaseOrderMetricsForRange({
    corpClientId,
    since: `${fromDate}T00:00:00.000Z`,
    till: `${toDate}T23:59:59.999Z`,
  });
  const clientName = rows[0]?.clientName?.trim() || requestedClientName || corpClientId;
  const completedTrips = rows.filter((row) => row.successOrderFlag === true).length;
  const totalSpend = rows.reduce((sum, row) => sum + row.clientPaid, 0);
  const totalDecoupling = rows.reduce((sum, row) => sum + row.decoupling, 0);

  return (
    <section className="crm-page relative">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Link href="/sales-operation/b2b-clients" className="text-sm font-medium text-accent hover:underline">
          ← Back to B2B Clients Overview
        </Link>
        <a
          href={`https://corp-admin-frontend.taxi.yandex-team.ru/corp-clients?search=${encodeURIComponent(
            corpClientId,
          )}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium text-slate-600 transition hover:text-red-600"
        >
          Open in corp admin
        </a>
      </div>

      <PageHeading
        title={clientName}
        subtitle={`Trips from ${formatDateLabel(fromDate)} to ${formatDateLabel(toDate)}`}
      />

      <div className="mb-4 grid gap-4 md:grid-cols-4">
        <div className="glass-surface rounded-3xl p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-muted">Corp client ID</p>
          <p className="mt-2 break-all text-sm font-semibold text-slate-900">{corpClientId}</p>
        </div>
        <div className="glass-surface rounded-3xl p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-muted">Rows</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{rows.length.toLocaleString("en-US")}</p>
        </div>
        <div className="glass-surface rounded-3xl p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-muted">Completed trips</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">
            {completedTrips.toLocaleString("en-US")}
          </p>
        </div>
        <div className="glass-surface rounded-3xl p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-muted">Total spend</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{formatMoney(totalSpend)}</p>
          <p className="mt-1 text-xs text-muted">Decoupling: {formatMoney(totalDecoupling)}</p>
        </div>
      </div>

      <section className="glass-surface overflow-hidden rounded-3xl">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 bg-white/60 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Trips list</h2>
            <p className="text-xs text-muted">
              Showing the same Yango/Supabase source as B2B Clients Overview for the selected period.
            </p>
          </div>
          <div className="text-xs text-muted">
            {formatDateLabel(fromDate)} - {formatDateLabel(toDate)}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50/80 text-xs uppercase tracking-[0.14em] text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Trip date</th>
                <th className="px-4 py-3 text-left font-semibold">Order</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Client paid</th>
                <th className="px-4 py-3 text-right font-semibold">Driver received</th>
                <th className="px-4 py-3 text-right font-semibold">Decoupling</th>
                <th className="px-4 py-3 text-center font-semibold">Flag</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70 bg-white/40">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted">
                    No trips found for this client in the selected period.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.orderId} className="hover:bg-white/80">
                    <td className="px-4 py-3 text-slate-700">{formatDateTime(row.scheduledAt)}</td>
                    <td className="px-4 py-3">
                      <a
                        href={`https://go-admin-frontend.taxi.yandex-team.ru/orders/${encodeURIComponent(
                          row.orderId,
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-slate-900 transition hover:text-red-600"
                      >
                        {row.orderId}
                      </a>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${getStatusTone(
                          row.statusRaw,
                          row.successOrderFlag,
                        )}`}
                      >
                        {getStatusLabel(row.statusRaw, row.successOrderFlag)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-900">{formatMoney(row.clientPaid)}</td>
                    <td className="px-4 py-3 text-right text-slate-900">{formatMoney(row.driverReceived)}</td>
                    <td className="px-4 py-3 text-right text-slate-900">{formatMoney(row.decoupling)}</td>
                    <td className="px-4 py-3 text-center text-slate-700">
                      {row.decouplingFlg === null ? "n/a" : row.decouplingFlg ? "Yes" : "No"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
