import { requireCallCenterOperatorAccess } from "@/lib/call-center/access";
import {
  createContactFromThreeCx,
  lookupCrmEntityByPhone,
} from "@/lib/call-center/baroz-crm";
import { getLastCallCenterCallByPhone } from "@/lib/call-center/calls-repository";
import { isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireCallCenterOperatorAccess(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const phone = url.searchParams.get("phone")?.trim() || "";
  if (!phone) {
    return Response.json({ ok: true, entity: null, lastCall: null });
  }

  try {
    const [entity, lastCall] = await Promise.all([
      lookupCrmEntityByPhone(phone, { includeDrivers: true }),
      isSupabaseConfigured() ? getLastCallCenterCallByPhone(phone) : Promise.resolve(null),
    ]);
    return Response.json({ ok: true, entity, lastCall });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Lookup failed." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireCallCenterOperatorAccess(request);
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => null)) as {
    phone?: unknown;
    firstName?: unknown;
    lastName?: unknown;
  } | null;
  const phone = typeof body?.phone === "string" ? body.phone.trim() : "";
  const firstName = typeof body?.firstName === "string" ? body.firstName.trim() : "";
  if (!phone) {
    return Response.json({ ok: false, error: "Phone is required." }, { status: 400 });
  }

  try {
    await createContactFromThreeCx({
      phone,
      firstName: firstName || "Unknown",
      lastName: typeof body?.lastName === "string" ? body.lastName : null,
    });
    const entity = await lookupCrmEntityByPhone(phone, { includeDrivers: true });
    const lastCall = isSupabaseConfigured() ? await getLastCallCenterCallByPhone(phone) : null;
    return Response.json({ ok: true, entity, lastCall });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Create failed." },
      { status: 500 },
    );
  }
}
