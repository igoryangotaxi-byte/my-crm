import {
  canonicalCorpCostCenterSettingsUuid,
  listYangoCostCenters,
  resolveUserCostCenterIdByPhone,
} from "@/lib/yango-api";
import { getClientScope, requireApprovedUser } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeString(input: unknown): string {
  return typeof input === "string" ? input.trim() : "";
}

/**
 * Cost centers for the selected Yango corp client (same auth as request-rides-create).
 * Admin passes tokenLabel + clientId in JSON; client portal users use session scope.
 */
export async function POST(request: Request) {
  const auth = await requireApprovedUser(request);
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => null)) as
    | { tokenLabel?: unknown; clientId?: unknown; phoneNumber?: unknown }
    | null;

  const scope = getClientScope(auth.user);
  const tokenLabel = scope?.tokenLabel ?? normalizeString(body?.tokenLabel);
  const clientId = scope?.apiClientId ?? normalizeString(body?.clientId);

  if (!tokenLabel || !clientId) {
    return Response.json(
      { ok: false, error: "tokenLabel and clientId are required." },
      { status: 400 },
    );
  }

  try {
    let items = await listYangoCostCenters({ tokenLabel, clientId });
    const phoneNumber = normalizeString(body?.phoneNumber);
    if (items.length === 0 && phoneNumber) {
      const fromPhone = await resolveUserCostCenterIdByPhone({
        tokenLabel,
        clientId,
        phoneNumber,
      }).catch(() => null);
      const raw = (fromPhone ?? "").trim();
      const canon = raw ? canonicalCorpCostCenterSettingsUuid(raw) : null;
      if (canon) {
        items = [{ id: canon, name: "This rider's directory assignment" }];
      }
    }
    return Response.json({ ok: true, items }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to load cost centers.",
      },
      { status: 500 },
    );
  }
}
