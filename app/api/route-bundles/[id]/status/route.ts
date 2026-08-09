import { isSupabaseConfigured } from "@/lib/supabase";
import { requireRouteBundlesAccess } from "@/lib/route-bundles/access";
import { getBundle, updateBundleStatus } from "@/lib/route-bundles/repository";
import type { BundleStatus } from "@/lib/route-bundles/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED: BundleStatus[] = [
  "suggested",
  "reviewing",
  "driver_contacted",
  "accepted",
  "rejected",
  "active",
  "completed",
  "cancelled",
];

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireRouteBundlesAccess(request);
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }
  const { id } = await ctx.params;
  try {
    const body = (await request.json()) as { status?: string };
    const status = body.status as BundleStatus | undefined;
    if (!status || !ALLOWED.includes(status)) {
      return Response.json({ ok: false, error: "Invalid status." }, { status: 400 });
    }
    const existing = await getBundle(id);
    if (!existing) return Response.json({ ok: false, error: "Not found." }, { status: 404 });
    await updateBundleStatus(id, status, { userId: auth.user.id, name: auth.user.name });
    const bundle = await getBundle(id);
    return Response.json({ ok: true, bundle });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Status update failed." },
      { status: 500 },
    );
  }
}
