import { B2BClientsOverviewView } from "@/components/sales-operation/B2BClientsOverviewView";
import {
  getCorpClientNameMap,
  getYangoSupabaseOrderMetrics,
} from "@/lib/yango-supabase";

export const dynamic = "force-dynamic";

export default async function SalesOperationB2BClientsPage() {
  const [yangoRows, corpClientNameMap] = await Promise.all([
    getYangoSupabaseOrderMetrics(),
    getCorpClientNameMap(),
  ]);

  return <B2BClientsOverviewView yangoRows={yangoRows} corpClientNameMap={corpClientNameMap} />;
}
