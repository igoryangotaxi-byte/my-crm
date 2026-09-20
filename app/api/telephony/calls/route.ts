import { requireTelephonyAccess } from "@/lib/telephony/access";
import { getTelephonyAgent } from "@/lib/telephony/agents-repository";
import { listTelephonyCalls, upsertTelephonyCall } from "@/lib/telephony/calls-repository";
import { applyEnrichmentToCall } from "@/lib/telephony/enrich";
import { getTelephonyProvider } from "@/lib/telephony/get-provider";
import { logTelephony, logTelephonyError } from "@/lib/telephony/log";
import { israelPhoneKey, normalizeDestinationForThreeCx } from "@/lib/call-center/phone";
import { isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireTelephonyAccess(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const phone = url.searchParams.get("phone")?.trim() || "";
  const entityType = url.searchParams.get("entityType")?.trim() || "";
  const entityId = url.searchParams.get("entityId")?.trim() || "";
  const mine = url.searchParams.get("scope") === "mine";
  const limit = Number(url.searchParams.get("limit") || "50");

  const calls = await listTelephonyCalls({
    phoneKey: phone ? israelPhoneKey(phone) : undefined,
    crmEntityType: entityType || undefined,
    crmEntityId: entityId || undefined,
    agentAppliUserId: mine ? auth.user.id : undefined,
    limit,
  });

  return Response.json({ ok: true, calls });
}

export async function POST(request: Request) {
  const auth = await requireTelephonyAccess(request);
  if (!auth.ok) return auth.response;

  const provider = getTelephonyProvider();
  if (!provider) {
    return Response.json(
      {
        ok: false,
        code: "provider_unavailable",
        error: "Astradial telephony provider is not configured.",
      },
      { status: 503 },
    );
  }

  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 503 });
  }

  const agent = await getTelephonyAgent(auth.user.id);
  if (!agent?.extension) {
    return Response.json(
      {
        ok: false,
        code: "not_linked",
        error: "Link your Astradial extension in HUB → Astradial first.",
      },
      { status: 400 },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    phone?: unknown;
    entityType?: unknown;
    entityId?: unknown;
    context?: { tripId?: unknown; ticketId?: unknown };
  } | null;

  const rawPhone = typeof body?.phone === "string" ? body.phone : "";
  const destination = normalizeDestinationForThreeCx(rawPhone);
  if (!destination) {
    return Response.json({ ok: false, error: "Invalid phone number." }, { status: 400 });
  }

  const result = await provider.originateCall({
    fromExtension: agent.extension,
    toPhone: destination,
    variables: {
      appli_user_id: auth.user.id,
      entity_type: typeof body?.entityType === "string" ? body.entityType : "",
      entity_id: typeof body?.entityId === "string" ? body.entityId : "",
    },
  });

  if (!result.ok) {
    logTelephonyError({
      event: "click_to_call_failed",
      agentId: auth.user.id,
      error: result.error ?? "originate failed",
    });
    return Response.json({ ok: false, error: result.error ?? "Call failed." }, { status: 502 });
  }

  const call = await upsertTelephonyCall({
    provider: "astradial",
    providerCallId: result.providerCallId ?? null,
    channelId: result.channelId ?? null,
    direction: "outbound",
    fromNumber: agent.extension,
    toNumber: destination,
    status: "initiated",
    agentAppliUserId: auth.user.id,
    agentExtension: agent.extension,
    crmEntityType: typeof body?.entityType === "string" ? body.entityType : null,
    crmEntityId: typeof body?.entityId === "string" ? body.entityId : null,
    tripId: typeof body?.context?.tripId === "string" ? body.context.tripId : null,
    ticketId: typeof body?.context?.ticketId === "string" ? body.context.ticketId : null,
    raw: { originate: result },
  });

  void applyEnrichmentToCall(call.id, destination);

  logTelephony({
    event: "click_to_call",
    callId: call.id,
    providerCallId: result.providerCallId,
    agentId: auth.user.id,
  });

  return Response.json({ ok: true, call, channelId: result.channelId ?? null });
}
