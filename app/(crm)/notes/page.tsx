import { ReleaseNotesPanel } from "@/components/dashboard/ReleaseNotesPanel";
import { GreenplumSyncPanel } from "@/components/notes/GreenplumSyncPanel";
import { TokenDiagnosticsPanel } from "@/components/notes/TokenDiagnosticsPanel";
import { UnmappedCorpClientsPanel } from "@/components/notes/UnmappedCorpClientsPanel";
import {
  getLastSuccessfulSyncSummary,
  getRecentUnmappedCorpClients,
  getSupabaseConnectionStatus,
} from "@/lib/supabase";
import { getAllYangoPreOrders } from "@/lib/yango-api";

export const dynamic = "force-dynamic";

export default async function NotesPage() {
  const { diagnostics } = await getAllYangoPreOrders();
  const isLocalSyncEnabled = process.env.ENABLE_LOCAL_GREENPLUM_SYNC === "true";
  const isRemoteSyncEnabled = process.env.ENABLE_REMOTE_GREENPLUM_SYNC_REQUESTS === "true";
  const [supabaseStatus, lastSyncSummary, unmappedCorpClients] = await Promise.all([
    getSupabaseConnectionStatus(),
    getLastSuccessfulSyncSummary(),
    getRecentUnmappedCorpClients({ sampleSize: 8000, limit: 80 }),
  ]);

  return (
    <section className="crm-page">
      <GreenplumSyncPanel
        localEnabled={isLocalSyncEnabled}
        remoteEnabled={isRemoteSyncEnabled}
        supabaseConfigured={supabaseStatus.configured}
        supabaseReachable={supabaseStatus.reachable}
        supabaseMessage={supabaseStatus.message}
        lastSyncSummary={lastSyncSummary}
      />
      <UnmappedCorpClientsPanel rows={unmappedCorpClients} />
      <TokenDiagnosticsPanel diagnostics={diagnostics} />
      <ReleaseNotesPanel />
    </section>
  );
}
