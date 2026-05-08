import { getHeatmapMeta, getHeatmapPoints } from "@/lib/b2c-heatmap-repository";
import { requireApprovedUser } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export async function GET(request: Request) {
  const auth = await requireApprovedUser(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const from = url.searchParams.get("from")?.trim() ?? "";
  const to = url.searchParams.get("to")?.trim() ?? "";
  const metaOnly = url.searchParams.get("meta") === "1";

  if (metaOnly) {
    try {
      const meta = await getHeatmapMeta();
      return Response.json(
        {
          ok: true,
          minDate: meta.minDate,
          maxDate: meta.maxDate,
          totalRows: meta.totalRows,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch (e) {
      return Response.json(
        { ok: false, error: e instanceof Error ? e.message : "Failed to load heatmap metadata." },
        { status: 500 },
      );
    }
  }

  if (!isYmd(from) || !isYmd(to)) {
    return Response.json({ ok: false, error: "from and to must be YYYY-MM-DD." }, { status: 400 });
  }
  if (from > to) {
    return Response.json({ ok: false, error: "from must be <= to." }, { status: 400 });
  }

  try {
    const points = await getHeatmapPoints(from, to);
    return Response.json(
      {
        ok: true,
        points,
        from,
        to,
        returned: points.length,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : "Failed to load heatmap data." },
      { status: 500 },
    );
  }
}
