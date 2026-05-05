import {
  buildBussinessCenterPayload,
  normalizeDateRange,
} from "@/lib/bussiness-center";
import {
  loadBussinessCenterCache,
  saveBussinessCenterCache,
} from "@/lib/bussiness-center-cache";
import { getRequestRideApiClients } from "@/lib/yango-api";
import { getClientScope, requireApprovedUser } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function normalizeString(input: unknown): string {
  return typeof input === "string" ? input.trim() : "";
}

function resolveMaxOrdersCap(): number {
  const raw = Number.parseInt(process.env.YANGO_FINANCE_SUMMARY_MAX_ORDERS ?? "", 10);
  if (Number.isFinite(raw) && raw > 0) return raw;
  return 10000;
}

export async function POST(request: Request) {
  const auth = await requireApprovedUser(request);
  if (!auth.ok) return auth.response;
  const scope = getClientScope(auth.user);
  const body = (await request.json().catch(() => null)) as {
    tokenLabel?: unknown;
    clientId?: unknown;
    since?: unknown;
    till?: unknown;
  } | null;

  const tokenLabel = scope?.tokenLabel ?? normalizeString(body?.tokenLabel);
  const clientId = scope?.apiClientId ?? normalizeString(body?.clientId);
  if (!tokenLabel || !clientId) {
    return Response.json(
      { ok: false, error: "tokenLabel and clientId are required." },
      { status: 400 },
    );
  }

  if (!scope) {
    const allowed = await getRequestRideApiClients().catch(() => []);
    const hasAccess = allowed.some(
      (item) => item.tokenLabel === tokenLabel && item.clientId === clientId,
    );
    if (!hasAccess) {
      return Response.json(
        { ok: false, error: "Selected client is not available for your account." },
        { status: 403 },
      );
    }
  }

  const range = normalizeDateRange({ since: body?.since, till: body?.till });
  const cacheInput = { tokenLabel, clientId, since: range.since, till: range.till };

  const cached = await loadBussinessCenterCache(cacheInput);
  if (cached) {
    return Response.json(
      { ok: true, ...cached, cached: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const payload = await buildBussinessCenterPayload({
    tokenLabel,
    clientId,
    since: range.since,
    till: range.till,
    maxOrders: resolveMaxOrdersCap(),
  });
  await saveBussinessCenterCache(cacheInput, payload);

  return Response.json(
    { ok: true, ...payload, cached: false },
    { headers: { "Cache-Control": "no-store" } },
  );
}
