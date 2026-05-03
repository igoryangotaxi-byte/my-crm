import { B2BPreOrdersPanel } from "@/components/dashboard/B2BPreOrdersPanel";
import { getB2BPreOrdersDashboardDataForRange } from "@/lib/yango-api";
import {
  getCorpClientNameMap,
  getYangoSupabaseOrderMetrics,
} from "@/lib/yango-supabase";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const [{ rows: b2bRows }, yangoSupabaseRows, corpClientNameMap] = await Promise.all([
    getB2BPreOrdersDashboardDataForRange({
      since: startOfMonth.toISOString(),
      till: endOfMonth.toISOString(),
    }),
    getYangoSupabaseOrderMetrics(),
    getCorpClientNameMap(),
  ]);

  return (
    <section className="crm-page relative">
      <B2BPreOrdersPanel
        rows={b2bRows}
        yangoRows={yangoSupabaseRows}
        corpClientNameMap={corpClientNameMap}
      />
    </section>
  );
}
