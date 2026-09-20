import { requireTelephonyPage } from "@/lib/telephony/access";
import {
  deleteTelephonyAgent,
  getTelephonyAgent,
  isTelephonyAgentStatus,
  upsertTelephonyAgent,
} from "@/lib/telephony/agents-repository";
import { getTelephonyProvider } from "@/lib/telephony/get-provider";
import { isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireTelephonyPage(request);
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 503 });
  }
  const agent = await getTelephonyAgent(auth.user.id);
  return Response.json({ ok: true, agent });
}

export async function PUT(request: Request) {
  const auth = await requireTelephonyPage(request);
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as {
    extension?: unknown;
    providerUserId?: unknown;
    status?: unknown;
  } | null;

  const extension = typeof body?.extension === "string" ? body.extension.trim() : "";
  if (!extension) {
    return Response.json({ ok: false, error: "Extension is required." }, { status: 400 });
  }

  const status =
    body?.status !== undefined && isTelephonyAgentStatus(body.status) ? body.status : undefined;

  try {
    const agent = await upsertTelephonyAgent({
      appliUserId: auth.user.id,
      extension,
      providerUserId:
        typeof body?.providerUserId === "string" ? body.providerUserId.trim() || null : undefined,
      status,
    });

    const provider = getTelephonyProvider();
    if (provider?.setAgentActive && agent.providerUserId && status) {
      await provider.setAgentActive(agent.providerUserId, status === "available" || status === "busy");
    }

    return Response.json({ ok: true, agent });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Save failed." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const auth = await requireTelephonyPage(request);
  if (!auth.ok) return auth.response;
  try {
    await deleteTelephonyAgent(auth.user.id);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Disconnect failed." },
      { status: 500 },
    );
  }
}
