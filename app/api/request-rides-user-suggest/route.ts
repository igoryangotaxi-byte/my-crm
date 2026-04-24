import { searchRequestRideUsers } from "@/lib/yango-api";
import { requireApprovedUser } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SuggestPayload = {
  tokenLabel?: string;
  clientId?: string;
  query?: string;
};

function normalizeString(input: unknown): string {
  return typeof input === "string" ? input.trim() : "";
}

export async function POST(request: Request) {
  const auth = await requireApprovedUser(request);
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => null)) as SuggestPayload | null;
  const tokenLabel = normalizeString(body?.tokenLabel);
  const clientId = normalizeString(body?.clientId);
  const query = normalizeString(body?.query);

  if (!tokenLabel || !clientId || !query) {
    return Response.json(
      { ok: false, error: "tokenLabel, clientId and query are required." },
      { status: 400 },
    );
  }

  try {
    const users = await searchRequestRideUsers({ tokenLabel, clientId, query, limit: 8 });
    return Response.json({ ok: true, users }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to load user suggestions.",
      },
      { status: 500 },
    );
  }
}
