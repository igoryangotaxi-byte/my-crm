import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import { isThreeCxConfigured } from "@/lib/call-center/env";
import { listThreeCxDevices } from "@/lib/call-center/client";
import { getCallCenterUserSettings } from "@/lib/call-center/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireSalesOperationPage(request, "salesCallCenter");
  if (!auth.ok) return auth.response;
  if (!isThreeCxConfigured()) {
    return Response.json(
      { ok: false, error: "3CX is not configured on the server." },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const queryExt = url.searchParams.get("extension")?.trim() ?? "";
  const saved = await getCallCenterUserSettings(auth.user.id);
  const extension = queryExt || saved?.extension || "";
  if (!extension) {
    return Response.json(
      { ok: false, error: "Enter or save an extension first." },
      { status: 400 },
    );
  }

  try {
    const devices = await listThreeCxDevices(extension);
    return Response.json({ ok: true, extension, devices });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to load devices.",
      },
      { status: 502 },
    );
  }
}
