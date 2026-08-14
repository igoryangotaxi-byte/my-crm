import { isSupabaseConfigured } from "@/lib/supabase";
import { runAiCronTick } from "@/lib/ai/cron";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production") return false;
    return true;
  }
  const header = request.headers.get("authorization");
  if (header === `Bearer ${secret}`) return true;
  const url = new URL(request.url);
  return url.searchParams.get("secret") === secret;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }
  try {
    const result = await runAiCronTick();
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Cron failed." },
      { status: 500 },
    );
  }
}
