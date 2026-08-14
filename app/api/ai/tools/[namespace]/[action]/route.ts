import { loadAuthStore } from "@/lib/auth-store";
import { isSupabaseConfigured } from "@/lib/supabase";
import { isToolGatewayServiceRequest } from "@/lib/ai/service-auth";
import { buildTrustedAiContext } from "@/lib/ai/context";
import { executeAiTool } from "@/lib/ai/tool-gateway";
import { getAiPreferences } from "@/lib/ai/repository";
import { resolveToolName } from "@/lib/ai/tool-defs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ namespace: string; action: string }> };

export async function POST(request: Request, context: RouteContext) {
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }
  const service = isToolGatewayServiceRequest(request);
  if (!service) {
    return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  const { namespace, action } = await context.params;
  const tool = resolveToolName(`${namespace}.${action}`);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const store = await loadAuthStore();
  const user = store.users.find((item) => item.id === service.userId);
  if (!user || user.status !== "approved") {
    return Response.json({ ok: false, error: "User not found." }, { status: 403 });
  }
  const contextAi = await buildTrustedAiContext(user);
  const prefs = await getAiPreferences(user.id);
  const result = await executeAiTool({
    tool,
    args: body,
    context: contextAi,
    prefs,
    confirmed: body.confirmed === true,
    idempotencyKey: request.headers.get("idempotency-key"),
  });
  return Response.json({ ok: result.ok, result });
}
