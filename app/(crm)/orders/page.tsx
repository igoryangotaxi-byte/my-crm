import { B2BPreOrdersPanel } from "@/components/dashboard/B2BPreOrdersPanel";
import { PageHeading } from "@/components/ui/PageHeading";
import { getB2BPreOrdersDashboardData } from "@/lib/yango-api";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const { rows: b2bRows } = await getB2BPreOrdersDashboardData();

  return (
    <section>
      <PageHeading title="Orders" subtitle="B2B orders with filters and details" />
      <B2BPreOrdersPanel rows={b2bRows} view="orders" />
    </section>
  );
}
