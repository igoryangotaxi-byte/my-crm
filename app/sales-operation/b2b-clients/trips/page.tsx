import { PageHeader } from "@/components/ui/PageHeader";
import { StatTile } from "@/components/ui/StatTile";
import { TripsTable } from "@/components/sales-operation/analytics/TripsTable";
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

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 2,
  }).format(value);
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
        <PageHeader
          breadcrumbs={[
            { label: "B2B Clients Overview", href: "/sales-operation/b2b-clients" },
            { label: "Client trips" },
          ]}
          title="B2B client trips"
          subtitle="Open this page from Sales Operation → B2B Clients Overview to pass the client and selected period."
        />
        <section className="rounded-[16px] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
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
      <PageHeader
        breadcrumbs={[
          { label: "B2B Clients Overview", href: "/sales-operation/b2b-clients" },
          { label: clientName },
        ]}
        title={clientName}
        subtitle={`Trips from ${formatDateLabel(fromDate)} to ${formatDateLabel(toDate)}`}
        actions={
          <a
            href={`https://corp-admin-frontend.taxi.yandex-team.ru/corp-clients?search=${encodeURIComponent(
              corpClientId,
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="so-focus-ring inline-flex h-9 items-center rounded-[10px] border border-[var(--so-border-strong)] bg-[var(--so-surface)] px-3 text-sm font-semibold text-[var(--so-text)] transition-colors hover:bg-[var(--so-surface-hover)]"
          >
            Open in corp admin
          </a>
        }
      />

      <div className="mb-4 grid gap-3 md:grid-cols-4">
        <StatTile label="Corp client ID" value={<span className="break-all text-sm">{corpClientId}</span>} />
        <StatTile label="Rows" value={rows.length.toLocaleString("en-US")} />
        <StatTile label="Completed trips" value={completedTrips.toLocaleString("en-US")} tone="success" />
        <StatTile
          label="Total spend"
          value={formatMoney(totalSpend)}
          hint={`Decoupling: ${formatMoney(totalDecoupling)}`}
        />
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-[var(--so-text)]">Trips list</h2>
          <p className="text-xs text-[var(--so-muted)]">
            Showing the same Yango/Supabase source as B2B Clients Overview for the selected period.
          </p>
        </div>
        <div className="text-xs text-[var(--so-muted)]">
          {formatDateLabel(fromDate)} - {formatDateLabel(toDate)}
        </div>
      </div>
      <TripsTable rows={rows} />
    </section>
  );
}
