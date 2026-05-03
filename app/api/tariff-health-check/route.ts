import { isSupabaseConfigured } from "@/lib/supabase";
import { requireApprovedUser } from "@/lib/server-auth";
import { runTariffHealthCheck } from "@/lib/tariff-health-check";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_QUERY_LENGTH = 1000;

export async function POST(request: Request) {
  const auth = await requireApprovedUser(request);
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json(
      {
        ok: false,
        error:
          "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY.",
      },
      { status: 500 },
    );
  }

  const payload = (await request.json().catch(() => null)) as { query?: unknown } | null;
  const query = typeof payload?.query === "string" ? payload.query.trim() : "";
  if (!query) {
    return Response.json({ ok: false, error: "Query is required." }, { status: 400 });
  }
  if (query.length > MAX_QUERY_LENGTH) {
    return Response.json(
      { ok: false, error: `Query is too long (max ${MAX_QUERY_LENGTH} chars).` },
      { status: 400 },
    );
  }

  try {
    const result = await runTariffHealthCheck(query);
    return Response.json(result, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Tariff health check failed.",
      },
      { status: 500 },
    );
  }
}
