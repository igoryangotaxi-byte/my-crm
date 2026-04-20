import { FiltersBar } from "@/components/ui/FiltersBar";
import { PageHeading } from "@/components/ui/PageHeading";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Table, type TableColumn } from "@/components/ui/Table";
import { formatCurrency, orders } from "@/lib/mock-data";
import type { Order } from "@/types/crm";

const statusTone: Record<Order["status"], "green" | "yellow" | "red"> = {
  paid: "green",
  pending: "yellow",
  overdue: "red",
};

const orderColumns: TableColumn<Order>[] = [
  {
    key: "id",
    header: "Order ID",
    render: (row) => <span className="font-medium">{row.id}</span>,
  },
  {
    key: "client",
    header: "Client",
    render: (row) => row.clientName,
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
    render: (row) => <StatusBadge label={row.status} tone={statusTone[row.status]} />,
  },
  {
    key: "createdAt",
    header: "Date",
    render: (row) => row.createdAt,
  },
];

export default function OrdersPage() {
  return (
    <section>
      <PageHeading title="Orders" subtitle="Track all sales and invoices" />

      <div className="mb-4 rounded-2xl border border-border bg-panel p-3">
        <input
          type="search"
          placeholder="Search by order ID or client..."
          className="h-10 w-full rounded-xl border border-border bg-white px-3 text-sm outline-none transition focus:border-accent"
        />
      </div>

      <FiltersBar filters={["All", "Paid", "Pending", "Overdue"]} />
      <Table columns={orderColumns} rows={orders} />
    </section>
  );
}
