import { B2BPreOrdersPanel } from "@/components/dashboard/B2BPreOrdersPanel";
import { getB2BPreOrdersDashboardData } from "@/lib/yango-api";
import {
  getCorpClientNameMap,
  getYangoSupabaseOrderMetrics,
} from "@/lib/yango-supabase";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [{ rows: b2bRows }, yangoSupabaseRows, corpClientNameMap] = await Promise.all([
    getB2BPreOrdersDashboardData(),
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
