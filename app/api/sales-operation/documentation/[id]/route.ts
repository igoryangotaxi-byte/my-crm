import type { JSONContent } from "@tiptap/core";
import { isSupabaseConfigured } from "@/lib/supabase";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import {
  archiveDocumentationDocument,
  DocumentationConflictError,
  getDocumentationDocument,
  updateDocumentationDocument,
} from "@/lib/sales-operation/documentation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const auth = await requireSalesOperationPage(request, "salesDocumentation");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }
  const { id } = await ctx.params;
  try {
    const document = await getDocumentationDocument(id);
    if (!document) {
      return Response.json({ ok: false, error: "Document not found." }, { status: 404 });
    }
    return Response.json({ ok: true, document }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load document." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireSalesOperationPage(request, "salesDocumentation");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }
  const { id } = await ctx.params;
  try {
    const body = (await request.json()) as {
      title?: string;
      content?: JSONContent;
      position?: number;
      expectedUpdatedAt?: string;
    };
    const document = await updateDocumentationDocument(
      id,
      {
        title: body.title,
        content: body.content,
        position: body.position,
        expectedUpdatedAt: body.expectedUpdatedAt,
      },
      { userId: auth.user.id, name: auth.user.name },
    );
    return Response.json({ ok: true, document });
  } catch (error) {
    if (error instanceof DocumentationConflictError) {
      return Response.json(
        { ok: false, error: error.message, document: error.current, conflict: true },
        { status: 409 },
      );
    }
    const message = error instanceof Error ? error.message : "Failed to update document.";
    const status = message === "Document not found." ? 404 : 500;
    return Response.json({ ok: false, error: message }, { status });
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  const auth = await requireSalesOperationPage(request, "salesDocumentation");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }
  const { id } = await ctx.params;
  try {
    await archiveDocumentationDocument(id, { userId: auth.user.id, name: auth.user.name });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to delete document." },
      { status: 500 },
    );
  }
}
