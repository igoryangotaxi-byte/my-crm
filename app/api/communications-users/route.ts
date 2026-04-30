import { loadAuthStore } from "@/lib/auth-store";
import { normalizePhoneKey } from "@/lib/request-rides-user-map";
import { getClientScope, requireApprovedUser } from "@/lib/server-auth";
import { listYangoClientUsers } from "@/lib/yango-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Payload = {
  tokenLabel?: string;
  clientId?: string;
};

function normalizeString(input: unknown): string {
  return typeof input === "string" ? input.trim() : "";
}

export async function POST(request: Request) {
  const auth = await requireApprovedUser(request);
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => null)) as Payload | null;
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
    const [directory, store] = await Promise.all([
      listYangoClientUsers({ tokenLabel, clientId, limit: 1200 }).catch(() => []),
      loadAuthStore(),
    ]);
    const tenantNameByPhone = new Map<string, string>();
    for (const user of store.users) {
      if (
        user.accountType !== "client" ||
        user.tokenLabel !== tokenLabel ||
        user.apiClientId !== clientId
      ) {
        continue;
      }
      const phoneKey = normalizePhoneKey(user.phoneNumber ?? "");
      const name = user.name?.trim();
      if (!phoneKey || !name) continue;
      tenantNameByPhone.set(phoneKey, name);
    }

    const users = directory
      .filter((item) => normalizePhoneKey(item.phone ?? ""))
      .map((item) => {
        const phoneKey = normalizePhoneKey(item.phone ?? "");
        const localName = phoneKey ? tenantNameByPhone.get(phoneKey) : null;
        return {
          userId: item.userId,
          phone: item.phone,
          fullName: localName || item.fullName || item.phone || "Employee",
          source: localName ? "cabinet" : "api",
        };
      });

    return Response.json(
      { ok: true, users },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to load communication users.",
      },
      { status: 500 },
    );
  }
}
