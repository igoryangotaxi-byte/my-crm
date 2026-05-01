import { ReleaseNotesPanel } from "@/components/dashboard/ReleaseNotesPanel";
import { TokenOnboardingPanel } from "@/components/notes/TokenOnboardingPanel";
import { TokenDiagnosticsPanel } from "@/components/notes/TokenDiagnosticsPanel";
import { UnmappedCorpClientsPanel } from "@/components/notes/UnmappedCorpClientsPanel";
import { getRecentUnmappedCorpClients } from "@/lib/supabase";
import { getAllYangoPreOrders } from "@/lib/yango-api";

export const dynamic = "force-dynamic";

export default async function NotesPage() {
  const { diagnostics } = await getAllYangoPreOrders();
  const unmappedCorpClients = await getRecentUnmappedCorpClients({ sampleSize: 8000, limit: 80 });

  return (
    <section className="crm-page">
      <TokenOnboardingPanel />
      <UnmappedCorpClientsPanel rows={unmappedCorpClients} />
      <TokenDiagnosticsPanel diagnostics={diagnostics} />
      <ReleaseNotesPanel />
    </section>
  );
}
