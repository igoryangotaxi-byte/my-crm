import { MindMapEditor } from "@/components/mind-map/MindMapEditor";

export default async function MindMapBoardPage({
  params,
}: Readonly<{
  params: Promise<{ id: string }>;
}>) {
  const { id } = await params;
  return (
    <section className="crm-page flex min-h-0 flex-1 flex-col">
      <MindMapEditor mapId={id} />
    </section>
  );
}
