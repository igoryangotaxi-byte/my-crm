import { isSupabaseConfigured } from "@/lib/supabase";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import { ensureSalesClientForCorpClient } from "@/lib/sales-operation/ensure-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireSalesOperationPage(request, "salesSignedClients");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const body = (await request.json().catch(() => null)) as {
    corpClientId?: unknown;
    clientName?: unknown;
  } | null;

  const corpClientId = typeof body?.corpClientId === "string" ? body.corpClientId.trim() : "";
  const clientName = typeof body?.clientName === "string" ? body.clientName.trim() : null;
  if (!corpClientId) {
    return Response.json({ ok: false, error: "corpClientId is required." }, { status: 400 });
  }

  try {
    const result = await ensureSalesClientForCorpClient(
      corpClientId,
      { userId: auth.user.id, name: auth.user.name },
      { clientName },
    );
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to ensure client profile.",
      },
      { status: 500 },
    );
  }
}
