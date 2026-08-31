import { requireCallCenterDialAccess } from "@/lib/call-center/access";
import { isThreeCxConfigured } from "@/lib/call-center/env";
import { listThreeCxParticipants } from "@/lib/call-center/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireCallCenterDialAccess(request);
  if (!auth.ok) return auth.response;
  if (!isThreeCxConfigured()) {
    return Response.json(
      { ok: false, error: "3CX is not configured on the server." },
      { status: 503 },
    );
  }

  try {
    const participants = await listThreeCxParticipants(auth.settings.extension);
    return Response.json({
      ok: true,
      extension: auth.settings.extension,
      operatorStatus: auth.settings.operatorStatus,
      notificationsMuted: auth.settings.notificationsMuted,
      participants,
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to load participants.",
      },
      { status: 502 },
    );
  }
}
