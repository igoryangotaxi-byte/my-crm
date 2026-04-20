import { B2BPreOrdersPanel } from "@/components/dashboard/B2BPreOrdersPanel";
import { PageHeading } from "@/components/ui/PageHeading";
import { getB2BPreOrdersDashboardData } from "@/lib/yango-api";

export default async function DashboardPage() {
  const { rows: b2bRows } = await getB2BPreOrdersDashboardData();

  return (
    <section>
      <PageHeading title="Dashboard" subtitle="B2B pre-orders analytics" />

      <B2BPreOrdersPanel rows={b2bRows} />
    </section>
  );
}
