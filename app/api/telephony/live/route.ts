import { requireTelephonyAccess } from "@/lib/telephony/access";
import { getTelephonyAgent } from "@/lib/telephony/agents-repository";
import { listTelephonyCalls } from "@/lib/telephony/calls-repository";
import { getTelephonyProvider } from "@/lib/telephony/get-provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Poll fallback for GlobalCallPanel (SSE can be added later). */
export async function GET(request: Request) {
  const auth = await requireTelephonyAccess(request);
  if (!auth.ok) return auth.response;

  const agent = await getTelephonyAgent(auth.user.id);
  const provider = getTelephonyProvider();
  let live: Awaited<ReturnType<NonNullable<typeof provider>["getActiveCalls"]>> = [];
  let providerError: string | null = null;
  if (provider) {
    try {
      live = await provider.getActiveCalls();
    } catch (error) {
      providerError = error instanceof Error ? error.message : "Live poll failed.";
    }
  }

  const recent = await listTelephonyCalls({
    agentAppliUserId: auth.user.id,
    limit: 5,
  });

  const ringing = live.find((c) => /ring|dial|try/i.test(c.status)) ?? null;
  const active =
    live.find((c) => /answer|talk|bridge|connect/i.test(c.status)) ?? ringing ?? null;

  return Response.json({
    ok: true,
    linked: Boolean(agent?.extension),
    extension: agent?.extension ?? null,
    status: agent?.status ?? "offline",
    live,
    ringing,
    active,
    recent,
    providerError,
  });
}
