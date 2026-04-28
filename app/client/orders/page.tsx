import { getB2BOrdersViewDefaultRange, pullB2BOrdersRows } from "@/lib/yango-api";
import { getRequestUser } from "@/lib/server-auth";
import { headers } from "next/headers";
import { B2BPreOrdersPanel } from "@/components/dashboard/B2BPreOrdersPanel";

export const dynamic = "force-dynamic";

export default async function ClientOrdersPage() {
  const request = new Request("http://localhost/client/orders", { headers: headers() });
  const user = await getRequestUser(request);
  const range = getB2BOrdersViewDefaultRange();
  const scope =
    user?.accountType === "client" && user.tokenLabel && user.apiClientId
      ? { tokenLabel: user.tokenLabel, clientId: user.apiClientId }
      : undefined;
  const { newRows, nextCursors, hasMoreRemote, errors } = await pullB2BOrdersRows({
    since: range.since,
    till: range.till,
    startCursors: {},
    targetNewCount: 20,
    excludeKeys: new Set(),
    excludeScheduling: true,
    scope,
  });

  return (
    <section className="crm-page relative mx-3">
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
