import { isSupabaseConfigured } from "@/lib/supabase";
import { updateB2BClientManagers } from "@/lib/sales-operation/b2b-client-registry";
import type { UpdateB2BClientManagersInput } from "@/lib/sales-operation/manager-types";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import { loadAuthStore } from "@/lib/auth-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ corpClientId: string }> };

function resolveManagerName(
  userId: string | null | undefined,
  explicitName: string | null | undefined,
  users: Array<{ id: string; name: string }>,
): string | null {
  if (userId === undefined) return explicitName ?? null;
  if (!userId) return null;
  if (explicitName?.trim()) return explicitName.trim();
  return users.find((user) => user.id === userId)?.name ?? null;
}

export async function PATCH(request: Request, context: RouteContext) {
  // Used from B2B Overview and Clients list — either page is enough.
  const authB2b = await requireSalesOperationPage(request, "salesB2BClients");
  const authClients = authB2b.ok
    ? authB2b
    : await requireSalesOperationPage(request, "salesSignedClients");
  if (!authClients.ok) return authClients.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const { corpClientId } = await context.params;
  let body: UpdateB2BClientManagersInput;
  try {
    body = (await request.json()) as UpdateB2BClientManagersInput;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const store = await loadAuthStore();
    const input: UpdateB2BClientManagersInput = {};
    if ("accountManagerUserId" in body) {
      input.accountManagerUserId = body.accountManagerUserId;
      input.accountManagerName = resolveManagerName(
        body.accountManagerUserId,
        body.accountManagerName,
        store.users,
      );
    }
    if ("salesManagerUserId" in body) {
      input.salesManagerUserId = body.salesManagerUserId;
      input.salesManagerName = resolveManagerName(
        body.salesManagerUserId,
        body.salesManagerName,
        store.users,
      );
    }
    const entry = await updateB2BClientManagers(corpClientId, input);
    return Response.json({ ok: true, entry }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to update managers." },
      { status: 500 },
    );
  }
}
