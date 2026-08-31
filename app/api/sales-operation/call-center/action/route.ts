import { requireCallCenterDialAccess } from "@/lib/call-center/access";
import { isThreeCxConfigured } from "@/lib/call-center/env";
import {
  threeCxParticipantAction,
  type ParticipantAction,
} from "@/lib/call-center/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIONS = new Set<ParticipantAction>(["answer", "drop", "divert", "transferto"]);

export async function POST(request: Request) {
  const auth = await requireCallCenterDialAccess(request);
  if (!auth.ok) return auth.response;
  if (!isThreeCxConfigured()) {
    return Response.json(
      { ok: false, error: "3CX is not configured on the server." },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    participantId?: unknown;
    action?: unknown;
    destination?: unknown;
  } | null;

  const participantId =
    typeof body?.participantId === "number"
      ? body.participantId
      : typeof body?.participantId === "string" && Number.isFinite(Number(body.participantId))
        ? Number(body.participantId)
        : NaN;
  const action = typeof body?.action === "string" ? body.action : "";
  if (!Number.isFinite(participantId) || !ACTIONS.has(action as ParticipantAction)) {
    return Response.json(
      { ok: false, error: "participantId and a valid action are required." },
      { status: 400 },
    );
  }

  const destination = typeof body?.destination === "string" ? body.destination.trim() : undefined;

  try {
    const result = await threeCxParticipantAction({
      dn: auth.settings.extension,
      participantId,
      action: action as ParticipantAction,
      destination,
    });
    return Response.json({ ok: true, status: result.status, body: result.body });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Action failed.",
      },
      { status: 502 },
    );
  }
}
