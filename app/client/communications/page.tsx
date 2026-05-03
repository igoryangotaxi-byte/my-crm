"use client";

import { CommunicationsPanel } from "@/components/communications/CommunicationsPanel";
import { ClientPortalSectionGate } from "@/components/client/ClientPortalSectionGate";

export default function ClientCommunicationsPage() {
  return (
    <ClientPortalSectionGate section="communications">
      <CommunicationsPanel mode="client" />
    </ClientPortalSectionGate>
  );
}
