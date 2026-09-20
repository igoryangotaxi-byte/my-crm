import { requireTelephonyAccess } from "@/lib/telephony/access";
import { enrichTelephonyPhone } from "@/lib/telephony/enrich";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireTelephonyAccess(request);
  if (!auth.ok) return auth.response;

  const phone = new URL(request.url).searchParams.get("phone")?.trim() || "";
  if (!phone) {
    return Response.json({ ok: true, matches: [], phoneKey: "" });
  }

  const result = await enrichTelephonyPhone(phone);
  return Response.json({ ok: true, ...result });
}
