import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import { isOpenClawConfigured, openClawHealth } from "@/lib/ai/openclaw-client";
import { OPENCLAW_DENIED_TOOLS } from "@/lib/ai/risk-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireSalesOperationPage(request, "salesAiAssistant");
  if (!auth.ok) return auth.response;
  const claw = isOpenClawConfigured() ? await openClawHealth() : { ok: false, message: "OpenClaw not configured (local agent active)." };
  return Response.json({
    ok: true,
    openai: Boolean(process.env.OPENAI_API_KEY),
    openclaw: claw,
    deniedHostTools: OPENCLAW_DENIED_TOOLS,
  });
}
