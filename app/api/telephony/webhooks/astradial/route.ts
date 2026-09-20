import { verifyAstradialWebhookSignature } from "@/lib/telephony/webhook-auth";
import { findTelephonyAgentByExtension } from "@/lib/telephony/agents-repository";
import {
  insertTelephonyCallEvent,
  upsertTelephonyCall,
} from "@/lib/telephony/calls-repository";
import { applyEnrichmentToCall } from "@/lib/telephony/enrich";
import { logTelephony, logTelephonyError } from "@/lib/telephony/log";
import { isTelephonyEnabled } from "@/lib/telephony/env";
import { isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mapEventStatus(eventType: string): string {
  const e = eventType.toLowerCase();
  if (e.includes("answer")) return "answered";
  if (e.includes("ring")) return "ringing";
  if (e.includes("end") || e.includes("hangup")) return "ended";
  if (e.includes("fail") || e.includes("busy")) return "failed";
  if (e.includes("init")) return "initiated";
  return "unknown";
}

export async function POST(request: Request) {
  if (!isTelephonyEnabled()) {
    return Response.json(
      { ok: false, code: "telephony_disabled", error: "Telephony is disabled." },
      { status: 503 },
    );
  }
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 503 });
  }

  const rawBody = await request.text();
  const auth = verifyAstradialWebhookSignature({
    rawBody,
    signatureHeader: request.headers.get("x-pbx-signature") || request.headers.get("X-PBX-Signature"),
    timestampHeader: request.headers.get("x-pbx-timestamp") || request.headers.get("X-PBX-Timestamp"),
  });
  if (!auth.ok) {
    return Response.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  let payload: {
    id?: string;
    event?: string;
    timestamp?: string;
    data?: Record<string, unknown>;
  };
  try {
    payload = JSON.parse(rawBody) as typeof payload;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const eventType = typeof payload.event === "string" ? payload.event : "unknown";
  const providerEventId =
    typeof payload.id === "string" && payload.id.trim()
      ? payload.id.trim()
      : `astradial:${eventType}:${payload.timestamp ?? Date.now()}`;

  const data = payload.data && typeof payload.data === "object" ? payload.data : {};
  const from =
    typeof data.from === "string"
      ? data.from
      : typeof data.caller === "string"
        ? data.caller
        : typeof data.from_number === "string"
          ? data.from_number
          : null;
  const to =
    typeof data.to === "string"
      ? data.to
      : typeof data.destination === "string"
        ? data.destination
        : typeof data.to_number === "string"
          ? data.to_number
          : null;
  const extension =
    typeof data.extension === "string"
      ? data.extension
      : typeof data.agent === "string"
        ? data.agent
        : typeof data.answered_by === "string"
          ? data.answered_by
          : null;
  const channelId =
    typeof data.channel_id === "string"
      ? data.channel_id
      : typeof data.channelId === "string"
        ? data.channelId
        : null;
  const providerCallId =
    typeof data.call_id === "string"
      ? data.call_id
      : typeof data.linkedid === "string"
        ? data.linkedid
        : channelId;

  try {
    const eventInsert = await insertTelephonyCallEvent({
      providerEventId,
      eventType,
      eventAt: typeof payload.timestamp === "string" ? payload.timestamp : undefined,
      payload: { event: eventType, data },
    });

    if (!eventInsert.inserted) {
      return Response.json({ ok: true, duplicate: true });
    }

    const agent = extension ? await findTelephonyAgentByExtension(extension) : null;
    const direction =
      typeof data.direction === "string"
        ? data.direction
        : eventType.toLowerCase().includes("outbound")
          ? "outbound"
          : "inbound";

    const call = await upsertTelephonyCall({
      provider: "astradial",
      providerCallId,
      channelId,
      direction,
      fromNumber: from,
      toNumber: to,
      status: mapEventStatus(eventType),
      agentAppliUserId: agent?.appliUserId ?? null,
      agentExtension: extension,
      answeredAt: mapEventStatus(eventType) === "answered" ? new Date().toISOString() : null,
      endedAt: mapEventStatus(eventType) === "ended" ? new Date().toISOString() : null,
      durationSec: typeof data.duration === "number" ? data.duration : null,
      recordingRef: typeof data.recording_url === "string" ? data.recording_url : null,
      raw: { webhook: payload },
    });

    await insertTelephonyCallEvent({
      callId: call.id,
      providerEventId: `${providerEventId}:linked`,
      eventType: `${eventType}.linked`,
      payload: { callId: call.id },
    }).catch(() => null);

    const enrichPhone = direction === "outbound" ? to : from;
    if (enrichPhone) {
      void applyEnrichmentToCall(call.id, enrichPhone);
    }

    logTelephony({
      event: "webhook_ingested",
      callId: call.id,
      providerCallId,
      detail: eventType,
    });

    return Response.json({ ok: true, callId: call.id });
  } catch (error) {
    logTelephonyError({
      event: "webhook_failed",
      error: error instanceof Error ? error.message : "webhook failed",
      detail: eventType,
    });
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Webhook failed." },
      { status: 500 },
    );
  }
}
