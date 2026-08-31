import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import {
  deleteCallCenterUserSettings,
  getCallCenterUserSettings,
  upsertCallCenterUserSettings,
} from "@/lib/call-center/repository";
import { isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(request: Request) {
  const auth = await requireSalesOperationPage(request, "salesCallCenter");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const body = (await request.json().catch(() => null)) as {
    extension?: unknown;
    preferredDeviceId?: unknown;
  } | null;
  if (!body) {
    return Response.json({ ok: false, error: "Invalid body." }, { status: 400 });
  }

  const extension = typeof body.extension === "string" ? body.extension.trim() : "";
  if (!extension) {
    return Response.json({ ok: false, error: "Extension is required." }, { status: 400 });
  }
  if (!/^\d{2,8}$/.test(extension)) {
    return Response.json(
      { ok: false, error: "Extension must be 2–8 digits." },
      { status: 400 },
    );
  }

  const preferredDeviceId =
    typeof body.preferredDeviceId === "string" && body.preferredDeviceId.trim()
      ? body.preferredDeviceId.trim()
      : null;

  try {
    const settings = await upsertCallCenterUserSettings({
      userId: auth.user.id,
      extension,
      preferredDeviceId,
    });
    return Response.json({ ok: true, settings });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to save settings." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const auth = await requireSalesOperationPage(request, "salesCallCenter");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  try {
    await deleteCallCenterUserSettings(auth.user.id);
    const settings = await getCallCenterUserSettings(auth.user.id);
    return Response.json({ ok: true, linked: Boolean(settings) });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to unlink." },
      { status: 500 },
    );
  }
}
