import Link from "next/link";
import { FiltersBar } from "@/components/ui/FiltersBar";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Table, type TableColumn } from "@/components/ui/Table";
import { clients, formatCurrency } from "@/lib/mock-data";
import type { Client } from "@/types/crm";

const statusTone: Record<Client["status"], "green" | "yellow" | "gray"> = {
  active: "green",
  lead: "yellow",
  inactive: "gray",
};

const clientColumns: TableColumn<Client>[] = [
  {
    key: "name",
    header: "Client",
    render: (row) => (
      <div>
        <p className="font-medium text-slate-900">{row.name}</p>
        <p className="text-xs text-muted">{row.company}</p>
      </div>
    ),
  },
  {
    key: "contacts",
    header: "Contacts",
    render: (row) => (
      <div>
        <p>{row.email}</p>
        <p className="text-xs text-muted">{row.phone}</p>
      </div>
    ),
  },
  {
    key: "status",
    header: "Status",
    render: (row) => (
      <StatusBadge label={row.status} tone={statusTone[row.status]} />
    ),
  },
  {
    key: "revenue",
    header: "Revenue",
    render: (row) => <span className="font-medium">{formatCurrency(row.totalRevenue)}</span>,
  },
  {
    key: "actions",
    header: "",
    render: (row) => (
      <Link
        href={`/clients/${row.id}`}
        className="text-sm font-medium text-accent hover:underline"
      >
        Open
      </Link>
    ),
    className: "text-right",
  },
];

export default function ClientsPage() {
  return (
    <section className="crm-page">
      <div className="mb-4 rounded-2xl border border-border bg-panel p-3">
        <input
          type="search"
          placeholder="Search by name, company or email..."
          className="crm-input h-10 w-full px-3 text-sm"
        />
      </div>

      <FiltersBar filters={["All", "Active", "Lead", "Inactive"]} />

      <Table columns={clientColumns} rows={clients} />
    </section>
  );
}
