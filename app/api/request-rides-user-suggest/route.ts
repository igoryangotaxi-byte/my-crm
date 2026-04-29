import { resolveRequestRideUserByPhone, searchRequestRideUsers } from "@/lib/yango-api";
import { loadAuthStore } from "@/lib/auth-store";
import { getTenantEmployeeLinks } from "@/lib/client-employee-links";
import { normalizePhoneKey } from "@/lib/request-rides-user-map";
import { getClientScope, requireApprovedUser } from "@/lib/server-auth";

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
  const scope = getClientScope(auth.user);
  const tokenLabel = scope?.tokenLabel ?? normalizeString(body?.tokenLabel);
  const clientId = scope?.apiClientId ?? normalizeString(body?.clientId);
  const query = normalizeString(body?.query);

  if (!tokenLabel || !clientId || !query) {
    return Response.json(
      { ok: false, error: "tokenLabel, clientId and query are required." },
      { status: 400 },
    );
  }

  try {
    let users: Awaited<ReturnType<typeof searchRequestRideUsers>> = [];
    try {
      users = await searchRequestRideUsers({ tokenLabel, clientId, query, limit: 8 });
    } catch {
      users = [];
    }
    let enriched = users;
    if (scope?.tenantId) {
      const store = await loadAuthStore();
      const byPhone = new Map<string, string>();
      const links = getTenantEmployeeLinks(scope.tenantId);
      const byRemoteUserId = new Map<string, string>();
      const localTenantSuggestions: Array<{
        userId: string;
        phone: string | null;
        fullName: string | null;
        source: "map";
      }> = [];
      const digitsQuery = query.replace(/\D/g, "");
      const normalizedQuery = query.trim().toLowerCase();
      for (const user of store.users) {
        if (user.accountType !== "client" || user.tenantId !== scope.tenantId) continue;
        const phone = typeof user.phoneNumber === "string" ? user.phoneNumber.trim() : "";
        const name = user.name?.trim();
        const key = normalizePhoneKey(phone);
        if (!key || !name) continue;
        byPhone.set(key, name);
        const linkedRemoteId = links[user.id];
        if (linkedRemoteId) byRemoteUserId.set(linkedRemoteId, name);
        const nameMatched = normalizedQuery.length > 0 && name.toLowerCase().includes(normalizedQuery);
        const phoneMatched = digitsQuery.length > 0 && key.includes(digitsQuery);
        if (nameMatched || phoneMatched) {
          const existingByPhone = users.find((item) => normalizePhoneKey(item.phone ?? "") === key);
          let resolvedRemoteUserId = linkedRemoteId || existingByPhone?.userId || "";
          if (!resolvedRemoteUserId && localTenantSuggestions.length < 4) {
            try {
              const probe = await resolveRequestRideUserByPhone({
                tokenLabel,
                clientId,
                phoneNumber: phone,
              });
              resolvedRemoteUserId = probe?.userId ?? "";
            } catch {
              resolvedRemoteUserId = "";
            }
          }
          if (!resolvedRemoteUserId) continue;
          localTenantSuggestions.push({
            userId: resolvedRemoteUserId,
            phone: phone || `+${key}`,
            fullName: name,
            source: "map",
          });
        }
      }
      enriched = users.map((item) => {
        if (item.fullName?.trim()) return item;
        const linkedName = byRemoteUserId.get(item.userId);
        if (linkedName) return { ...item, fullName: linkedName };
        const key = normalizePhoneKey(item.phone ?? "");
        const mappedName = key ? byPhone.get(key) : null;
        if (mappedName) return { ...item, fullName: mappedName };
        if (item.phone?.trim()) return { ...item, fullName: item.phone.trim() };
        return item;
      });
      const existingKeys = new Set(enriched.map((item) => normalizePhoneKey(item.phone ?? "")));
      for (const local of localTenantSuggestions) {
        const key = normalizePhoneKey(local.phone ?? "");
        if (!key || existingKeys.has(key)) continue;
        enriched.unshift(local);
      }
      enriched = enriched.slice(0, 8);
    }
    enriched = enriched.map((item) => {
      if (item.fullName?.trim()) return item;
      if (item.phone?.trim()) return { ...item, fullName: item.phone.trim() };
      return item;
    });
    return Response.json({ ok: true, users: enriched }, { headers: { "Cache-Control": "no-store" } });
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
