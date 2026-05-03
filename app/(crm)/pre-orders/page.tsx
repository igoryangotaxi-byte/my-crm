import { PreOrdersBoard } from "@/components/pre-orders/PreOrdersBoard";
import { getAllYangoPreOrders } from "@/lib/yango-api";

export const dynamic = "force-dynamic";

export default async function PreOrdersPage() {
  const { preOrders, errors } = await getAllYangoPreOrders();

  return (
    <PreOrdersBoard
      preOrders={preOrders}
      errors={errors}
    />
  );
}
