import type { AuthUser } from "@/types/auth";
import { findUserByEmail } from "@/lib/auth-store";

/** Sheet / free-text Hub Expert labels that map to CRM users by email. */
export const DRIVER_HUB_EXPERT_EMAIL_BY_ALIAS: Record<string, string> = {
  itay: "itayb@appli.taxi",
  adam: "adamshnayder@appli.taxi",
};

export function normalizeHubExpertAlias(raw: string | null | undefined): string {
  return (raw ?? "").trim().toLowerCase();
}

export async function resolveDriverHubExpert(
  rawName: string | null | undefined,
): Promise<{ userId: string; name: string } | null> {
  const alias = normalizeHubExpertAlias(rawName);
  if (!alias || alias === "unassigned") return null;
  const email = DRIVER_HUB_EXPERT_EMAIL_BY_ALIAS[alias];
  if (!email) return null;
  const user = await findUserByEmail(email);
  if (!user || user.status !== "approved") return null;
  return { userId: user.id, name: user.name };
}

export function resolveDriverHubExpertFromUsers(
  rawName: string | null | undefined,
  users: AuthUser[],
): { userId: string; name: string } | null {
  const alias = normalizeHubExpertAlias(rawName);
  if (!alias || alias === "unassigned") return null;
  const email = DRIVER_HUB_EXPERT_EMAIL_BY_ALIAS[alias];
  if (!email) return null;
  const user = users.find((u) => u.email.trim().toLowerCase() === email);
  if (!user || user.status !== "approved") return null;
  return { userId: user.id, name: user.name };
}
