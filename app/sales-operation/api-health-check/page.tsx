import { TokenDiagnosticsPanel } from "@/components/notes/TokenDiagnosticsPanel";
import { TokenOnboardingPanel } from "@/components/notes/TokenOnboardingPanel";
import { SectionHeader } from "@/components/patterns/SectionHeader";
import { getAllYangoPreOrders } from "@/lib/yango-api";

export const dynamic = "force-dynamic";

export default async function SalesOperationApiHealthCheckPage() {
  const { diagnostics } = await getAllYangoPreOrders();

  return (
    <section className="crm-page space-y-4">
      <SectionHeader
        title="API Health Check"
        subtitle="Onboard Yango API tokens and review live diagnostics."
      />
      <TokenOnboardingPanel />
      <TokenDiagnosticsPanel diagnostics={diagnostics} />
    </section>
  );
}
