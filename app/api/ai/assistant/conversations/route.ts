import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import { isSupabaseConfigured } from "@/lib/supabase";
import { getConversation, listConversations, listMessages } from "@/lib/ai/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireSalesOperationPage(request, "salesAiAssistant");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (id) {
    const conversation = await getConversation(id, auth.user.id);
    if (!conversation) return Response.json({ ok: false, error: "Not found." }, { status: 404 });
    const messages = await listMessages(id, auth.user.id);
    return Response.json({ ok: true, conversation, messages });
  }
  const conversations = await listConversations(auth.user.id);
  return Response.json({ ok: true, conversations });
}
