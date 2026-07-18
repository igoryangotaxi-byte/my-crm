import { SalesClientDetailView } from "@/components/sales-operation/SalesClientDetailView";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function SalesOperationB2BClientDetailPage({ params }: PageProps) {
  const { id } = await params;
  return <SalesClientDetailView clientId={id} />;
}
