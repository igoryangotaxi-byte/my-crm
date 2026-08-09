import { isSupabaseConfigured } from "@/lib/supabase";
import { requireRouteBundlesAccess } from "@/lib/route-bundles/access";
import { getBundle, updateBundleDriver } from "@/lib/route-bundles/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireRouteBundlesAccess(request);
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }
  const { id } = await ctx.params;
  try {
    const body = (await request.json()) as {
      driverId?: string | null;
      driverName?: string | null;
      driverPhone?: string | null;
    };
    const existing = await getBundle(id);
    if (!existing) return Response.json({ ok: false, error: "Not found." }, { status: 404 });
    await updateBundleDriver(
      id,
      {
        driverId: body.driverId ?? null,
        driverName: body.driverName ?? null,
        driverPhone: body.driverPhone ?? null,
      },
      { userId: auth.user.id, name: auth.user.name },
    );
    const bundle = await getBundle(id);
    return Response.json({ ok: true, bundle });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Driver update failed." },
      { status: 500 },
    );
  }
}
