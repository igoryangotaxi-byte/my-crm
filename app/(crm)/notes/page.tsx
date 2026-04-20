import { ReleaseNotesPanel } from "@/components/dashboard/ReleaseNotesPanel";
import { TokenDiagnosticsPanel } from "@/components/notes/TokenDiagnosticsPanel";
import { PageHeading } from "@/components/ui/PageHeading";
import { getAllYangoPreOrders } from "@/lib/yango-api";

export const dynamic = "force-dynamic";

export default async function NotesPage() {
  const { diagnostics } = await getAllYangoPreOrders();

  return (
    <section>
      <PageHeading
        title="Notes"
        subtitle="Token diagnostics and release notes"
      />
      <TokenDiagnosticsPanel diagnostics={diagnostics} />
      <ReleaseNotesPanel />
    </section>
  );
}
