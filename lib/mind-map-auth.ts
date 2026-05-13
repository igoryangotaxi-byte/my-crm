import type { AuthUser } from "@/types/auth";

export function canMutateMindMap(user: AuthUser, createdBy: string): boolean {
  return user.role === "Admin" || user.id === createdBy;
}
