import { B2BPreOrdersPanel } from "@/components/dashboard/B2BPreOrdersPanel";
import { getB2BOrdersViewDefaultRange, pullB2BOrdersRows } from "@/lib/yango-api";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const range = getB2BOrdersViewDefaultRange();
  const { newRows, nextCursors, hasMoreRemote, errors } = await pullB2BOrdersRows({
    since: range.since,
    till: range.till,
    startCursors: {},
    targetNewCount: 20,
    excludeKeys: new Set(),
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
