import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import { isSupabaseConfigured } from "@/lib/supabase";
import { getAiPreferences, upsertAiPreferences } from "@/lib/ai/repository";
import type { AiUserPreferences } from "@/lib/ai/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireSalesOperationPage(request, "salesAiAssistant");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }
  const preferences = await getAiPreferences(auth.user.id);
  return Response.json({ ok: true, preferences });
}

export async function PATCH(request: Request) {
  const auth = await requireSalesOperationPage(request, "salesAiAssistant");
  if (!auth.ok) return auth.response;
  const body = (await request.json().catch(() => null)) as Partial<AiUserPreferences> | null;
  if (!body) return Response.json({ ok: false, error: "Invalid body." }, { status: 400 });
  const preferences = await upsertAiPreferences(auth.user.id, body);
  return Response.json({ ok: true, preferences });
}
