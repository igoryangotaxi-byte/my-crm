import { ReleaseNotesPanel } from "@/components/dashboard/ReleaseNotesPanel";
import { NotesPageIntroCards } from "@/components/notes/NotesPageIntroCards";
import { UnmappedCorpClientsPanel } from "@/components/notes/UnmappedCorpClientsPanel";
import { getRecentUnmappedCorpClients } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function NotesPage() {
  const unmappedCorpClients = await getRecentUnmappedCorpClients({ sampleSize: 8000, limit: 80 });

  return (
    <section className="crm-page">
      <NotesPageIntroCards />
      <UnmappedCorpClientsPanel rows={unmappedCorpClients} />
      <ReleaseNotesPanel />
    </section>
  );
}
