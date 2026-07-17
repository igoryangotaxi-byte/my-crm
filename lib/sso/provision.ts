import {
  SEEDED_ADMIN_EMAIL,
  createAuthBackedUser,
  loadAuthStore,
  saveAuthStore,
} from "@/lib/auth-store";
import type { AppRole, AuthStoreData, AuthUser } from "@/types/auth";

export type ProvisionResult =
  | { ok: true; user: AuthUser }
  | { ok: false; reason: "rejected" };

function isSeededAdmin(email: string): boolean {
  return email.trim().toLowerCase() === SEEDED_ADMIN_EMAIL.trim().toLowerCase();
}

/** Pure: the seeded admin email becomes Admin; every other workspace user is a User. */
export function resolveSsoRole(email: string): AppRole {
  return isSeededAdmin(email) ? "Admin" : "User";
}

/**
 * Find an existing internal user for the verified Google email, or auto-provision one.
 * New users are created approved with role `User`; the seeded admin email becomes `Admin`.
 * Users an admin previously rejected stay locked out.
 */
export async function findOrProvisionSsoUser(input: {
  email: string;
  name?: string | null;
}): Promise<ProvisionResult> {
  const email = input.email.trim().toLowerCase();
  const store = await loadAuthStore();

  const existing = store.users.find((user) => user.email.trim().toLowerCase() === email);
  if (existing) {
    if (existing.status === "rejected") {
      return { ok: false, reason: "rejected" };
    }
    if (existing.status !== "approved") {
      const approved: AuthUser = { ...existing, status: "approved" };
      const nextStore: AuthStoreData = {
        ...store,
        users: store.users.map((user) => (user.id === existing.id ? approved : user)),
      };
      await saveAuthStore(nextStore);
      return { ok: true, user: approved };
    }
    return { ok: true, user: existing };
  }

  const randomPassword = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  const created = await createAuthBackedUser({
    name: (input.name?.trim() || email).slice(0, 120),
    email,
    password: randomPassword,
    role: resolveSsoRole(email),
    status: "approved",
    accountType: "internal",
    language: "en",
  });

  const nextStore: AuthStoreData = {
    ...store,
    users: [...store.users, created],
  };
  await saveAuthStore(nextStore);
  return { ok: true, user: created };
}
