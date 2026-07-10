import { redirect } from "next/navigation";
import { buildSalesOperationB2BClientTripsHref } from "@/lib/sales-operation/b2b-client-trips-href";

export const dynamic = "force-dynamic";

type LegacyYangoClientTripsPageProps = {
  searchParams: Promise<{
    corpClientId?: string | string[];
    clientName?: string | string[];
    from?: string | string[];
    to?: string | string[];
  }>;
};

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

/** Legacy CRM path — keep bookmarks working inside Sales Operation. */
export default async function LegacyYangoClientTripsRedirect({
  searchParams,
}: LegacyYangoClientTripsPageProps) {
  const params = await searchParams;
  const corpClientId = firstParam(params.corpClientId).trim();
  const clientName = firstParam(params.clientName).trim();
  const from = firstParam(params.from).trim();
  const to = firstParam(params.to).trim();

  if (corpClientId && from && to) {
    redirect(
      buildSalesOperationB2BClientTripsHref({
        corpClientId,
        clientName: clientName || undefined,
        from,
        to,
      }),
    );
  }

  redirect("/sales-operation/b2b-clients");
}
