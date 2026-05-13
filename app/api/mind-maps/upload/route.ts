import { canMutateMindMap } from "@/lib/mind-map-auth";
import { requireApprovedUser } from "@/lib/server-auth";
import { getSupabaseAdminClient, isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
]);

function sanitizeFilename(name: string): string {
  const base = name.replace(/[/\\]/g, "_").trim() || "file";
  return base.length > 180 ? base.slice(0, 180) : base;
}

export async function POST(request: Request) {
  const auth = await requireApprovedUser(request);
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ ok: false, error: "Invalid form data." }, { status: 400 });
  }

  const mindMapIdRaw = formData.get("mindMapId");
  const mindMapId = typeof mindMapIdRaw === "string" ? mindMapIdRaw.trim() : "";
  const file = formData.get("file");

  if (!mindMapId) {
    return Response.json({ ok: false, error: "mindMapId is required." }, { status: 400 });
  }
  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ ok: false, error: "file is required." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ ok: false, error: "File too large (max 10 MB)." }, { status: 400 });
  }

  const mime = file.type || "application/octet-stream";
  if (!ALLOWED_MIME.has(mime)) {
    return Response.json(
      { ok: false, error: "Unsupported file type. Use images or PDF." },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdminClient();
  const { data: existing, error: loadError } = await supabase
    .from("mind_maps")
    .select("created_by")
    .eq("id", mindMapId)
    .maybeSingle();

  if (loadError) {
    return Response.json({ ok: false, error: loadError.message }, { status: 500 });
  }
  if (!existing) {
    return Response.json({ ok: false, error: "Map not found." }, { status: 404 });
  }
  if (!canMutateMindMap(auth.user, existing.created_by)) {
    return Response.json({ ok: false, error: "Forbidden." }, { status: 403 });
  }

  const safeName = sanitizeFilename(file.name);
  const objectPath = `${mindMapId}/${crypto.randomUUID()}_${safeName}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await supabase.storage
    .from("mind-map-files")
    .upload(objectPath, buffer, { contentType: mime, upsert: false });

  if (uploadError) {
    return Response.json({ ok: false, error: uploadError.message }, { status: 500 });
  }

  return Response.json({
    ok: true,
    path: objectPath,
    name: file.name,
    mime,
    size: file.size,
  });
}
