import { resolveRequestRideUserByPhone, searchRequestRideUsers } from "@/lib/yango-api";
import { loadAuthStore } from "@/lib/auth-store";
import { getTenantEmployeeLinks } from "@/lib/client-employee-links";
import {
  normalizePhoneKey,
  normalizeYangoClientIdKey,
  resolveMappedUserId,
} from "@/lib/request-rides-user-map";
import { getClientScope, requireApprovedUser } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Yango user search can paginate; avoid killing prod suggestions with the default 10s ceiling. */
export const maxDuration = 60;

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
  const clientIdKey = clientId ? normalizeYangoClientIdKey(clientId) : "";
  /** Pass raw scope `apiClientId` into Yango (not only dashed key) so corp header matches the cabinet token. */
  const clientIdForYango = clientId.trim();

  if (!tokenLabel || !clientId || !query) {
    return Response.json(
      { ok: false, error: "tokenLabel, clientId and query are required." },
      { status: 400 },
    );
  }

  try {
    let users: Awaited<ReturnType<typeof searchRequestRideUsers>> = [];
    try {
      users = await searchRequestRideUsers({ tokenLabel, clientId: clientIdForYango, query, limit: 8 });
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
                clientId: clientIdForYango,
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
    } else {
      /** CRM operators (no tenant scope): local JSON map is gitignored and absent on Vercel — resolve Yango user_id by phone like tenant suggestions do. */
      const store = await loadAuthStore();
      const digitsQuery = query.replace(/\D/g, "");
      const normalizedQuery = query.trim().toLowerCase();
      const tLabel = tokenLabel.trim();
      const cId = clientIdKey;
      const localCandidates = store.users
        .filter(
          (user) =>
            user.accountType === "client" &&
            normalizeYangoClientIdKey((user.apiClientId ?? "").trim()) === cId &&
            (((user.tokenLabel ?? "").trim().toLowerCase() === tLabel.toLowerCase()) ||
              !(user.tokenLabel ?? "").trim()),
        )
        .slice(0, 400);
      const localNameByPhone = new Map<string, string>();
      for (const user of localCandidates) {
        const phone = user.phoneNumber?.trim() ?? "";
        const key = normalizePhoneKey(phone);
        const name = user.name?.trim() ?? "";
        if (!key || !name) continue;
        localNameByPhone.set(key, name);
      }
      const existingByPhone = new Set(enriched.map((item) => normalizePhoneKey(item.phone ?? "")));
      let phoneProbes = 0;
      const maxPhoneProbes = 8;
      for (const user of localCandidates) {
        if (enriched.length >= 8) break;
        const phone = user.phoneNumber?.trim() ?? "";
        const key = normalizePhoneKey(phone);
        if (!key || existingByPhone.has(key)) continue;
        const name = user.name?.trim() ?? "";
        const nameMatched =
          normalizedQuery.length > 0 && name.length > 0 && name.toLowerCase().includes(normalizedQuery);
        const phoneMatched = digitsQuery.length > 0 && key.includes(digitsQuery);
        if (!nameMatched && !phoneMatched) continue;
        let mappedUserId = resolveMappedUserId({
          tokenLabel: tLabel,
          clientId: cId,
          phoneNumber: phone,
        });
        if (!mappedUserId && phoneProbes < maxPhoneProbes) {
          phoneProbes += 1;
          try {
            const probe = await resolveRequestRideUserByPhone({
              tokenLabel: tLabel,
              clientId: clientIdForYango,
              phoneNumber: phone,
            });
            mappedUserId = probe?.userId ?? null;
          } catch {
            mappedUserId = null;
          }
        }
        if (!mappedUserId) continue;
        existingByPhone.add(key);
        enriched.unshift({
          userId: mappedUserId,
          phone: phone || `+${key}`,
          fullName: name || phone || `+${key}`,
          source: "map",
        });
      }
      enriched = enriched.slice(0, 8);
      enriched = enriched.map((item) => {
        if (item.fullName?.trim()) return item;
        const key = normalizePhoneKey(item.phone ?? "");
        const mappedName = key ? localNameByPhone.get(key) : null;
        if (mappedName) return { ...item, fullName: mappedName };
        return item;
      });
    }
    enriched = enriched.map((item) => {
      if (item.fullName?.trim()) return item;
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
