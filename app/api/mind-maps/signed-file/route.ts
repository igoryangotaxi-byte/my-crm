import { requireApprovedUser } from "@/lib/server-auth";
import { getSupabaseAdminClient, isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const auth = await requireApprovedUser(request);
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const url = new URL(request.url);
  const path = url.searchParams.get("path")?.trim() ?? "";
  if (!path || path.includes("..") || path.startsWith("/")) {
    return Response.json({ ok: false, error: "Invalid path." }, { status: 400 });
  }

  const mapId = path.split("/")[0] ?? "";
  if (!UUID_RE.test(mapId)) {
    return Response.json({ ok: false, error: "Invalid path." }, { status: 400 });
  }
  if (!path.startsWith(`${mapId}/`)) {
    return Response.json({ ok: false, error: "Invalid path." }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  const { data: mapRow, error: mapErr } = await supabase
    .from("mind_maps")
    .select("id")
    .eq("id", mapId)
    .maybeSingle();

  if (mapErr) {
    return Response.json({ ok: false, error: mapErr.message }, { status: 500 });
  }
  if (!mapRow) {
    return Response.json({ ok: false, error: "Not found." }, { status: 404 });
  }

  const { data, error } = await supabase.storage
    .from("mind-map-files")
    .createSignedUrl(path, 3600);

  if (error || !data?.signedUrl) {
    return Response.json(
      { ok: false, error: error?.message ?? "Could not sign URL." },
      { status: 500 },
    );
  }

  return Response.json({ ok: true, url: data.signedUrl });
}
