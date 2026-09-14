import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import { listYangoTokenHealth } from "@/lib/yango-api";
import { NOTES_ONBOARDING_HREF, YANGO_TOKEN_ONBOARDING_HREF } from "@/lib/yango-token-health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireSalesOperationPage(request, "salesAiAssistant");
  if (!auth.ok) return auth.response;
  const tokens = await listYangoTokenHealth();
  const publicTokens = tokens.map((row) => ({
    label: row.label,
    clientName: row.clientName,
    status: row.status,
  }));
  return Response.json({
    ok: true,
    tokens: publicTokens,
    liveCount: publicTokens.filter((row) => row.status === "live").length,
    deadCount: publicTokens.filter((row) => row.status === "dead").length,
    connectHref: YANGO_TOKEN_ONBOARDING_HREF,
    notesHref: NOTES_ONBOARDING_HREF,
  });
}
