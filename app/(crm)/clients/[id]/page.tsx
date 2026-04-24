import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeading } from "@/components/ui/PageHeading";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Table, type TableColumn } from "@/components/ui/Table";
import { clients, formatCurrency, orders } from "@/lib/mock-data";
import type { Order } from "@/types/crm";

const statusTone = {
  active: "green",
  lead: "yellow",
  inactive: "gray",
} as const;

const orderTone = {
  paid: "green",
  pending: "yellow",
  overdue: "red",
} as const;

type ClientDetailsPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ClientDetailsPage({ params }: ClientDetailsPageProps) {
  const { id } = await params;
  const client = clients.find((item) => item.id === id);

  if (!client) {
    notFound();
  }

  const clientOrders = orders.filter((order) => order.clientId === client.id);

  const orderColumns: TableColumn<Order>[] = [
    {
      key: "id",
      header: "Order ID",
      render: (row) => <span className="font-medium">{row.id}</span>,
    },
    {
      key: "title",
      header: "Title",
      render: (row) => row.title,
    },
    {
      key: "amount",
      header: "Amount",
      render: (row) => formatCurrency(row.amount),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => <StatusBadge label={row.status} tone={orderTone[row.status]} />,
    },
  ];

  return (
    <section className="crm-page">
      <div className="mb-3">
        <Link href="/clients" className="text-sm font-medium text-accent hover:underline">
          ← Back to clients
        </Link>
      </div>

      <PageHeading
        title={client.name}
        subtitle={`Client profile: ${client.company}`}
      />

      <div className="glass-surface mb-6 grid gap-4 rounded-2xl p-4 md:grid-cols-2">
        <div>
          <p className="text-sm text-muted">Email</p>
          <p className="font-medium text-slate-900">{client.email}</p>
        </div>
        <div>
          <p className="text-sm text-muted">Phone</p>
          <p className="font-medium text-slate-900">{client.phone}</p>
        </div>
        <div>
          <p className="text-sm text-muted">Status</p>
          <StatusBadge label={client.status} tone={statusTone[client.status]} />
        </div>
        <div>
          <p className="text-sm text-muted">Total revenue</p>
          <p className="font-medium text-slate-900">
            {formatCurrency(client.totalRevenue)}
          </p>
        </div>
      </div>

      <h2 className="crm-section-title mb-3">Client orders</h2>
      <Table columns={orderColumns} rows={clientOrders} emptyText="No orders yet" />
    </section>
  );
}
