import { TokenDiagnosticsPanel } from "@/components/notes/TokenDiagnosticsPanel";
import { TokenOnboardingPanel } from "@/components/notes/TokenOnboardingPanel";
import { getAllYangoPreOrders } from "@/lib/yango-api";

export const dynamic = "force-dynamic";

export default async function SalesOperationApiHealthCheckPage() {
  const { diagnostics } = await getAllYangoPreOrders();

  return (
    <section className="crm-page">
      <TokenOnboardingPanel />
      <TokenDiagnosticsPanel diagnostics={diagnostics} />
    </section>
  );
}
