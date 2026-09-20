import { requireTelephonyAccess } from "@/lib/telephony/access";
import { getTelephonyCallById, updateTelephonyCallAi } from "@/lib/telephony/calls-repository";
import { getTelephonyProvider } from "@/lib/telephony/get-provider";
import { logTelephony, logTelephonyError } from "@/lib/telephony/log";
import { transcribeAudio } from "@/lib/ai/voice";
import { requestChatText } from "@/lib/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireTelephonyAccess(request);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const call = await getTelephonyCallById(id);
  if (!call) {
    return Response.json({ ok: false, error: "Call not found." }, { status: 404 });
  }

  const providerCallId = call.providerCallId || call.recordingRef;
  if (!providerCallId) {
    return Response.json({ ok: false, error: "No recording reference on this call." }, { status: 400 });
  }

  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "1" || url.searchParams.get("force") === "true";
  if (!force && call.summary && call.transcription) {
    return Response.json({
      ok: true,
      cached: true,
      transcription: call.transcription,
      summary: call.summary,
    });
  }

  const provider = getTelephonyProvider();
  if (!provider) {
    return Response.json({ ok: false, error: "Provider unavailable." }, { status: 503 });
  }

  const recording = await provider.getRecording(providerCallId);
  if (!recording.ok) {
    return Response.json({ ok: false, error: recording.error }, { status: 404 });
  }

  try {
    const transcription =
      call.transcription ||
      (await transcribeAudio(recording.body, recording.contentType || "audio/wav"));

    if (!transcription) {
      return Response.json({ ok: false, error: "Empty transcription." }, { status: 422 });
    }

    const summary =
      call.summary ||
      (await requestChatText({
        systemPrompt:
          "You summarize phone calls for a taxi CRM agent. Reply in the same language as the transcript. " +
          "Be concise: 3–6 bullets covering reason for call, decisions, follow-ups, and customer sentiment. No preamble.",
        userPrompt: transcription.slice(0, 24000),
        timeoutMs: 60000,
        maxTokens: 800,
        temperature: 0.2,
      }));

    const updated = await updateTelephonyCallAi(id, { transcription, summary });

    logTelephony({
      event: "call_summarized",
      callId: id,
      agentId: auth.user.id,
      providerCallId,
    });

    return Response.json({
      ok: true,
      cached: false,
      transcription: updated.transcription,
      summary: updated.summary,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Summarize failed.";
    logTelephonyError({ event: "call_summarize_failed", callId: id, error: message });
    return Response.json({ ok: false, error: message }, { status: 502 });
  }
}
