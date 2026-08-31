import { requireCallCenterDialAccess } from "@/lib/call-center/access";
import { isThreeCxConfigured } from "@/lib/call-center/env";
import { makeThreeCxCall } from "@/lib/call-center/client";
import { normalizeDestinationForThreeCx } from "@/lib/call-center/phone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireCallCenterDialAccess(request);
  if (!auth.ok) return auth.response;

  if (!isThreeCxConfigured()) {
    return Response.json(
      { ok: false, error: "3CX is not configured on the server." },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => null)) as { phone?: unknown } | null;
  const rawPhone = typeof body?.phone === "string" ? body.phone : "";
  const destination = normalizeDestinationForThreeCx(rawPhone);
  if (!destination) {
    return Response.json({ ok: false, error: "Invalid phone number." }, { status: 400 });
  }

  try {
    const result = await makeThreeCxCall({
      dn: auth.settings.extension,
      deviceId: auth.settings.preferredDeviceId,
      destination,
    });
    return Response.json({
      ok: true,
      destination,
      extension: auth.settings.extension,
      status: result.status,
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Call failed.",
      },
      { status: 502 },
    );
  }
}
