import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import { isSupabaseConfigured } from "@/lib/supabase";
import { consumeConfirmation, getAiPreferences } from "@/lib/ai/repository";
import { buildTrustedAiContext } from "@/lib/ai/context";
import { executeAiTool } from "@/lib/ai/tool-gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireSalesOperationPage(request, "salesAiAssistant");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }
  const body = (await request.json().catch(() => null)) as { token?: string } | null;
  if (!body?.token) return Response.json({ ok: false, error: "token is required" }, { status: 400 });
  const pending = await consumeConfirmation(body.token, auth.user.id);
  if (!pending) {
    return Response.json({ ok: false, error: "Confirmation expired or already used." }, { status: 410 });
  }
  const context = await buildTrustedAiContext(auth.user);
  const prefs = await getAiPreferences(auth.user.id);
  const result = await executeAiTool({
    tool: pending.tool,
    args: pending.args,
    context,
    prefs,
    confirmed: true,
  });
  return Response.json({ ok: result.ok, result });
}
