import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { defaultRolePermissions } from "@/types/auth";
import { seedSupabaseAuthDefaultsIfMissing } from "@/lib/supabase-auth-store";

type TableState = {
  crm_role_permissions: Array<{ role: string; permissions: Record<string, boolean> }>;
  crm_role_area_access: Array<{ role: string; area_access: Record<string, boolean> }>;
  crm_role_dashboard_block_access: Array<{
    role: string;
    dashboard_block_access: Record<string, boolean>;
  }>;
  crm_global_b2c_settings: Array<{
    id: number;
    enabled: boolean;
    token: string | null;
    client_id: string | null;
    ride_class: string;
    create_endpoint: string | null;
  }>;
  crm_user_profiles: Array<Record<string, unknown>>;
  crm_tenant_accounts: Array<Record<string, unknown>>;
  crm_tenant_roles: Array<Record<string, unknown>>;
};

function createMockSupabase(initial: Partial<TableState> = {}) {
  const state: TableState = {
    crm_role_permissions: initial.crm_role_permissions ?? [],
    crm_role_area_access: initial.crm_role_area_access ?? [],
    crm_role_dashboard_block_access: initial.crm_role_dashboard_block_access ?? [],
    crm_global_b2c_settings: initial.crm_global_b2c_settings ?? [],
    crm_user_profiles: initial.crm_user_profiles ?? [],
    crm_tenant_accounts: initial.crm_tenant_accounts ?? [],
    crm_tenant_roles: initial.crm_tenant_roles ?? [],
  };

  const writes: Array<{ table: keyof TableState; op: "insert" | "upsert" | "update" }> = [];

  const from = (table: keyof TableState) => {
    const roleRows = () =>
      (state[table] as Array<{ role: string }>).map((row) => ({ role: row.role }));

    return {
      select(_cols: string, _opts?: unknown) {
        if (_opts && typeof _opts === "object" && "head" in (_opts as object)) {
          return Promise.resolve({
            count: state.crm_user_profiles.length,
            error: null,
          });
        }

        const listResult = Promise.resolve({
          data:
            table === "crm_user_profiles" ||
            table === "crm_tenant_accounts" ||
            table === "crm_tenant_roles"
              ? (state[table] as unknown[])
              : roleRows(),
          error: null,
        });

        return {
          eq(column: string, value: unknown) {
            return {
              async maybeSingle() {
                if (table === "crm_global_b2c_settings" && column === "id") {
                  const row = state.crm_global_b2c_settings.find((item) => item.id === value);
                  return { data: row ?? null, error: null };
                }
                return { data: null, error: null };
              },
            };
          },
          order(_col: string, _opts?: unknown) {
            return {
              then(onFulfilled: (value: { data: unknown[]; error: null }) => unknown) {
                return listResult.then(onFulfilled);
              },
            };
          },
          then(onFulfilled: (value: { data: unknown[]; error: null }) => unknown) {
            return listResult.then(onFulfilled);
          },
        };
      },
      insert(rows: unknown) {
        writes.push({ table, op: "insert" });
        const list = Array.isArray(rows) ? rows : [rows];
        (state[table] as unknown[]).push(...(list as unknown[]));
        return Promise.resolve({ error: null });
      },
      upsert(_rows: unknown, _opts?: unknown) {
        writes.push({ table, op: "upsert" });
        return Promise.resolve({ error: null });
      },
    };
  };

  return { state, writes, client: { from } };
}

describe("seedSupabaseAuthDefaultsIfMissing", () => {
  it("does not upsert or overwrite existing permission rows", async () => {
    const customPermissions = { ...defaultRolePermissions.Admin, orders: false };
    const mock = createMockSupabase({
      crm_role_permissions: [{ role: "Admin", permissions: customPermissions }],
      crm_role_area_access: [{ role: "Admin", area_access: { b2b: true, b2c: true } }],
      crm_role_dashboard_block_access: [
        {
          role: "Admin",
          dashboard_block_access: { apiData: true, yangoData: true, tariffHealthCheck: true },
        },
      ],
      crm_global_b2c_settings: [
        {
          id: 1,
          enabled: true,
          token: "keep-me",
          client_id: "client-1",
          ride_class: "comfortplus",
          create_endpoint: null,
        },
      ],
    });

    await seedSupabaseAuthDefaultsIfMissing(mock.client as never);

    assert.equal(mock.writes.some((item) => item.op === "upsert"), false);
    assert.equal(mock.state.crm_role_permissions[0]?.permissions.orders, false);
    assert.equal(mock.state.crm_global_b2c_settings[0]?.token, "keep-me");
  });
});

describe("loadAuthStoreFromSupabase read path", () => {
  it("does not invoke seed upserts on load (select-only hot path)", () => {
    const src = readFileSync(join(process.cwd(), "lib/supabase-auth-store.ts"), "utf8");
    const start = src.indexOf("export async function loadAuthStoreFromSupabase");
    assert.ok(start >= 0);
    const end = src.indexOf("export async function saveAuthStoreToSupabase", start);
    assert.ok(end > start);
    const body = src.slice(start, end);
    assert.doesNotMatch(body, /ensureSupabaseAuthStoreInitialized/);
    assert.doesNotMatch(body, /ensureDefaultSettings/);
    assert.doesNotMatch(body, /seedDefaultAdminProfileIfEmpty/);
    assert.doesNotMatch(body, /ensureDefaultAdminAuthFallbackSeeded/);
    assert.doesNotMatch(body, /\.upsert\(/);
    assert.doesNotMatch(body, /\.insert\(/);
  });
});
