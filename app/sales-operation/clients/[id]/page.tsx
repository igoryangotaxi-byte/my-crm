import { SalesClientDetailView } from "@/components/sales-operation/SalesClientDetailView";

export const dynamic = "force-dynamic";

type SalesClientDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function SalesOperationClientDetailPage({ params }: SalesClientDetailPageProps) {
  const { id } = await params;
  return <SalesClientDetailView clientId={id} />;
}
