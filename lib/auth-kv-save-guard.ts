import { getAuthKvReadSucceededInRequest } from "@/lib/auth-kv-request-context";
import { PermissionStoreUnavailableError } from "@/lib/permission-store-unavailable";

/** Block Supabase Auth user deletions when this request did not successfully load the KV snapshot. */
export function guardManagedUserDeletionsRequireKvRead(): void {
  if (getAuthKvReadSucceededInRequest()) {
    return;
  }
  console.warn(
    "[auth] Skipping managed Supabase Auth user deletions: KV snapshot was not loaded successfully in this request.",
  );
  throw new PermissionStoreUnavailableError(
    "Permission store unavailable; user deletions were skipped and changes were not fully saved.",
  );
}
