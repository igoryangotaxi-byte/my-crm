import { PreOrdersBoard } from "@/components/pre-orders/PreOrdersBoard";
import { getRequestUser } from "@/lib/server-auth";
import { getScopedYangoPreOrders } from "@/lib/yango-api";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export default async function ClientPreOrdersPage() {
  const request = new Request("http://localhost/client/pre-orders", { headers: await headers() });
  const user = await getRequestUser(request);
  const scope =
    user?.accountType === "client" && user.tokenLabel && user.apiClientId
      ? { tokenLabel: user.tokenLabel, clientId: user.apiClientId }
      : null;
  const { preOrders, errors } = scope
    ? await getScopedYangoPreOrders(scope)
    : { preOrders: [], errors: ["Client scope is not configured."] };

  return <PreOrdersBoard preOrders={preOrders} errors={errors} />;
}
