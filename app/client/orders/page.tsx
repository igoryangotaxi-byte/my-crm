import { pullB2BOrdersRows } from "@/lib/yango-api";
import { getRequestUser } from "@/lib/server-auth";
import { headers } from "next/headers";
import { B2BPreOrdersPanel } from "@/components/dashboard/B2BPreOrdersPanel";

export const dynamic = "force-dynamic";

function getClientOrdersInitialRange() {
  const now = new Date();
  const since = new Date(now);
  // Client cabinet should start with a broad history window.
  since.setFullYear(now.getFullYear() - 2);
  const till = new Date(now);
  till.setDate(till.getDate() + 7);
  return {
    fromDateStr: since.toISOString().slice(0, 10),
    toDateStr: till.toISOString().slice(0, 10),
    since: since.toISOString(),
    till: till.toISOString(),
  };
}

export default async function ClientOrdersPage() {
  const request = new Request("http://localhost/client/orders", { headers: await headers() });
  const user = await getRequestUser(request);
  const range = getClientOrdersInitialRange();
  const scope =
    user?.accountType === "client" && user.tokenLabel && user.apiClientId
      ? { tokenLabel: user.tokenLabel, clientId: user.apiClientId }
      : undefined;
  if (!scope) {
    return (
      <section className="crm-page relative">
        <B2BPreOrdersPanel rows={[]} view="orders" />
      </section>
    );
  }
  const { newRows, nextCursors, hasMoreRemote, errors } = await pullB2BOrdersRows({
    since: range.since,
    till: range.till,
    startCursors: {},
    targetNewCount: 100,
    excludeKeys: new Set(),
    excludeScheduling: true,
    scope,
  });

  return (
    <section className="crm-page relative">
      <B2BPreOrdersPanel
        rows={newRows}
        view="orders"
        ordersRemote={{
          range,
          initialCursors: nextCursors,
          initialHasMore: hasMoreRemote,
          bootstrapErrors: errors,
        }}
      />
    </section>
  );
}
