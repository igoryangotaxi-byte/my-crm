import { loadAuthStore } from "@/lib/auth-store";
import { getSessionUserIdFromRequest } from "@/lib/server-session";
import type { AuthUser } from "@/types/auth";

export async function getRequestUser(request: Request): Promise<AuthUser | null> {
  const sessionUserId = getSessionUserIdFromRequest(request);
  if (!sessionUserId) return null;
  const store = await loadAuthStore();
  const user = store.users.find((item) => item.id === sessionUserId) ?? null;
  if (!user || user.status !== "approved") return null;
  return user;
}

export async function requireApprovedUser(request: Request) {
  const user = await getRequestUser(request);
  if (!user) {
    return {
      ok: false as const,
      response: Response.json({ ok: false, error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { ok: true as const, user };
}

export async function requireAdminUser(request: Request) {
  const user = await getRequestUser(request);
  if (!user) {
    return {
      ok: false as const,
      response: Response.json({ ok: false, error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (user.role !== "Admin") {
    return {
      ok: false as const,
      response: Response.json({ ok: false, error: "Forbidden" }, { status: 403 }),
    };
  }
  return { ok: true as const, user };
}
