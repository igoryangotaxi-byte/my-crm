import { redirect } from "next/navigation";
import { B2BPreOrdersPanel } from "@/components/dashboard/B2BPreOrdersPanel";
import { getB2BPreOrdersDashboardDataForRange } from "@/lib/yango-api";

export const dynamic = "force-dynamic";

type DashboardPageProps = {
  searchParams: Promise<{ section?: string }>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const params = await searchParams;
  if (params.section === "yango") {
    redirect("/sales-operation/b2b-clients");
  }

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const { rows: b2bRows } = await getB2BPreOrdersDashboardDataForRange({
    since: startOfMonth.toISOString(),
    till: endOfMonth.toISOString(),
  });

  return (
    <section className="crm-page relative">
      <B2BPreOrdersPanel rows={b2bRows} />
    </section>
  );
}
