import { requireTelephonyAccess } from "@/lib/telephony/access";
import { getTelephonyCallById } from "@/lib/telephony/calls-repository";
import { getTelephonyProvider } from "@/lib/telephony/get-provider";
import { logTelephony } from "@/lib/telephony/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ callId: string }> },
) {
  const auth = await requireTelephonyAccess(request);
  if (!auth.ok) return auth.response;

  const { callId } = await context.params;
  const call = await getTelephonyCallById(callId);
  const providerCallId = call?.providerCallId || call?.recordingRef || null;
  if (!providerCallId) {
    return Response.json({ ok: false, error: "Recording reference missing." }, { status: 404 });
  }

  const provider = getTelephonyProvider();
  if (!provider) {
    return Response.json({ ok: false, error: "Provider unavailable." }, { status: 503 });
  }

  const result = await provider.getRecording(providerCallId);
  if (!result.ok) {
    return Response.json({ ok: false, error: result.error }, { status: 404 });
  }

  logTelephony({
    event: "recording_play",
    callId,
    agentId: auth.user.id,
    providerCallId,
  });

  return new Response(result.body, {
    status: 200,
    headers: {
      "Content-Type": result.contentType,
      "Cache-Control": "private, no-store",
    },
  });
}
