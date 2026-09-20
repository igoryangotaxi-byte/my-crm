import { requireTelephonyAccess } from "@/lib/telephony/access";
import { findTelephonyCallByChannelId, getTelephonyCallById } from "@/lib/telephony/calls-repository";
import { getTelephonyProvider } from "@/lib/telephony/get-provider";
import { logTelephony } from "@/lib/telephony/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Action = "hangup" | "transfer";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; action: string }> },
) {
  const auth = await requireTelephonyAccess(request);
  if (!auth.ok) return auth.response;

  const { id, action: actionRaw } = await context.params;
  const action = actionRaw as Action;
  if (action !== "hangup" && action !== "transfer") {
    return Response.json({ ok: false, error: "Unsupported action." }, { status: 404 });
  }

  const provider = getTelephonyProvider();
  if (!provider) {
    return Response.json(
      { ok: false, code: "provider_unavailable", error: "Provider unavailable." },
      { status: 503 },
    );
  }

  const call = await getTelephonyCallById(id);
  const channelId = call?.channelId;
  if (!channelId) {
    // allow acting on raw channel id passed as :id when call row missing
    const byChannel = await findTelephonyCallByChannelId(id);
    const ch = byChannel?.channelId || id;
    return runAction(provider, action, ch, request, auth.user.id, byChannel?.id ?? null);
  }

  return runAction(provider, action, channelId, request, auth.user.id, call.id);
}

async function runAction(
  provider: NonNullable<ReturnType<typeof getTelephonyProvider>>,
  action: Action,
  channelId: string,
  request: Request,
  agentId: string,
  callId: string | null,
) {
  if (action === "hangup") {
    const result = await provider.hangupCall({ channelId });
    logTelephony({ event: "hangup", callId, agentId, providerCallId: channelId });
    return Response.json(result.ok ? { ok: true } : { ok: false, error: result.error }, {
      status: result.ok ? 200 : 502,
    });
  }

  const body = (await request.json().catch(() => null)) as { destination?: unknown } | null;
  const destination = typeof body?.destination === "string" ? body.destination.trim() : "";
  if (!destination) {
    return Response.json({ ok: false, error: "destination is required." }, { status: 400 });
  }
  const result = await provider.transferCall({ channelId, destination, type: "blind" });
  logTelephony({ event: "transfer", callId, agentId, detail: destination });
  return Response.json(result.ok ? { ok: true } : { ok: false, error: result.error }, {
    status: result.ok ? 200 : 502,
  });
}
