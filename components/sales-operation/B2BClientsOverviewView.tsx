"use client";

import { useCallback, useEffect, useState } from "react";
import { B2BPreOrdersPanel } from "@/components/dashboard/B2BPreOrdersPanel";
import type { B2BClientRegistryEntry } from "@/lib/sales-operation/manager-types";
import type { YangoSupabaseOrderMetric } from "@/types/crm";

type B2BClientsOverviewViewProps = {
  yangoRows: YangoSupabaseOrderMetric[];
  corpClientNameMap: Record<string, string>;
};

export function B2BClientsOverviewView({
  yangoRows,
  corpClientNameMap,
}: B2BClientsOverviewViewProps) {
  const [registry, setRegistry] = useState<B2BClientRegistryEntry[]>([]);

  const loadRegistry = useCallback(async () => {
    try {
      const res = await fetch("/api/sales-operation/b2b-clients/registry", { cache: "no-store" });
      const data = (await res.json()) as { ok?: boolean; registry?: B2BClientRegistryEntry[] };
      if (res.ok && data.ok) {
        setRegistry(data.registry ?? []);
      }
    } catch {
      setRegistry([]);
    }
  }, []);

  useEffect(() => {
    void loadRegistry();
  }, [loadRegistry]);

  return (
    <B2BPreOrdersPanel
      rows={[]}
      yangoRows={yangoRows}
      corpClientNameMap={corpClientNameMap}
      b2bClientRegistry={registry}
      onB2BRegistryUpdated={loadRegistry}
      view="b2bClientsOverview"
    />
  );
}
