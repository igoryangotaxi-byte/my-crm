import { assertThreeCxWebhookAuthorized, readBarOzString } from "@/lib/call-center/baroz-crm";
import { insertCallCenterCall } from "@/lib/call-center/calls-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Bar Oz Call Report — 3CX POST when a call ends (includes Recording URL).
 * Always return 200 with empty body on success (per PDF).
 */
export async function POST(request: Request) {
  const denied = assertThreeCxWebhookAuthorized(request);
  if (denied) return denied;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return new Response(null, { status: 200 });
  }

  const phone = readBarOzString(body, "Phone", "phone");
  if (!phone) {
    return new Response(null, { status: 200 });
  }

  try {
    await insertCallCenterCall({
      phone,
      queue: readBarOzString(body, "Queue", "queue"),
      direction: readBarOzString(body, "Direction", "direction"),
      callType: readBarOzString(body, "Type", "type", "CallType"),
      contactName: readBarOzString(body, "Name", "name"),
      agentExtension: readBarOzString(body, "Agent", "agent"),
      agentName: readBarOzString(body, "AgentName", "agent_name", "Agent_Name"),
      durationSec: readBarOzString(body, "Duration", "duration") ?? null,
      callAt: readBarOzString(body, "DateTime", "datetime", "Date_Time"),
      description: readBarOzString(body, "Description", "description"),
      recordingUrl: readBarOzString(
        body,
        "Recording URL",
        "Recording_URL",
        "RecordingUrl",
        "recording_url",
        "recordingUrl",
      ),
      summary: readBarOzString(body, "Summary", "summary"),
      transcription: readBarOzString(body, "Transcription", "transcription"),
      raw: body,
    });
  } catch (error) {
    console.error("[3cx call-report]", error);
  }

  return new Response(null, { status: 200 });
}
