import { redirect } from "next/navigation";

type PageProps = { params: Promise<{ id: string }> };

export default async function LegacyClientDetailPage(_props: PageProps) {
  redirect("/sales-operation/portfolio");
}
