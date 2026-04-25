import { pullB2BOrdersRows } from "@/lib/yango-api";
import { requireApprovedUser } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function normalizeString(input: unknown): string {
  return typeof input === "string" ? input.trim() : "";
}

export async function POST(request: Request) {
  const auth = await requireApprovedUser(request);
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => null)) as {
    since?: unknown;
    till?: unknown;
    targetCount?: unknown;
    cursors?: unknown;
    excludeOrderKeys?: unknown;
  } | null;

  const since = normalizeString(body?.since);
  const till = normalizeString(body?.till);
  if (!since || !till) {
    return Response.json({ ok: false, error: "since and till (ISO strings) are required." }, { status: 400 });
  }

  const rawTarget = Number(body?.targetCount);
  const targetCount = Number.isFinite(rawTarget)
    ? Math.min(100, Math.max(1, Math.floor(rawTarget)))
    : 20;

  const cursors =
    body?.cursors && typeof body.cursors === "object" && !Array.isArray(body.cursors)
      ? (body.cursors as Record<string, number>)
      : {};

  const excludeList = Array.isArray(body?.excludeOrderKeys) ? body.excludeOrderKeys : [];
  const excludeKeys = new Set(
    excludeList.filter((key): key is string => typeof key === "string" && key.length > 0),
  );

  try {
    const result = await pullB2BOrdersRows({
      since,
      till,
      startCursors: cursors,
      targetNewCount: targetCount,
      excludeKeys,
    });

    return Response.json(
      {
        ok: true,
        rows: result.newRows,
        nextCursors: result.nextCursors,
        hasMore: result.hasMoreRemote,
        errors: result.errors,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load orders.";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
