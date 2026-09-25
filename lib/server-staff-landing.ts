import { cookies } from "next/headers";
import { loadAuthStore } from "@/lib/auth-store";
import { STAFF_NO_ACCESS_PATH } from "@/lib/role-permissions";
import { resolvePostLoginPathForUser } from "@/lib/sso/post-login-path";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/server-session";

/** Permission-aware `/` redirect target (never hardcode My Space). */
export async function resolveRootLandingPath(): Promise<string> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return "/login";
  const payload = verifySessionToken(token);
  if (!payload?.userId) return "/login";

  const store = await loadAuthStore();
  const user = store.users.find((item) => item.id === payload.userId) ?? null;
  if (!user || user.status !== "approved") return "/login";
  if (user.accountType === "client") return "/client/request-rides";

  return resolvePostLoginPathForUser(store, user) ?? STAFF_NO_ACCESS_PATH;
}
