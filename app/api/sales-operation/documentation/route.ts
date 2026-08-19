import { isSupabaseConfigured } from "@/lib/supabase";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import {
  createDocumentationDocument,
  listDocumentationDocuments,
  reorderDocumentationDocuments,
} from "@/lib/sales-operation/documentation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireSalesOperationPage(request, "salesDocumentation");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }
  try {
    const documents = await listDocumentationDocuments();
    return Response.json({ ok: true, documents }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load documents." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireSalesOperationPage(request, "salesDocumentation");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }
  try {
    const body = (await request.json().catch(() => ({}))) as { title?: string; orderedIds?: string[] };
    if (Array.isArray(body.orderedIds)) {
      const documents = await reorderDocumentationDocuments(body.orderedIds, {
        userId: auth.user.id,
        name: auth.user.name,
      });
      return Response.json({ ok: true, documents });
    }
    const document = await createDocumentationDocument(
      { title: body.title },
      { userId: auth.user.id, name: auth.user.name },
    );
    return Response.json({ ok: true, document }, { status: 201 });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to save documents." },
      { status: 500 },
    );
  }
}
