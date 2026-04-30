import { revalidateTag } from "next/cache";
import { loadAuthStore, saveAuthStore } from "@/lib/auth-store";
import { relabelGoogleVendorForDisplay } from "@/lib/public-error-message";
import { upsertMappedUserId } from "@/lib/request-rides-user-map";
import { requireAdminUser } from "@/lib/server-auth";
import {
  detectYangoDefaultCostCenterId,
  getRequestRideApiClients,
  listYangoClientUsers,
  listYangoCostCenters,
} from "@/lib/yango-api";
import { validateYangoApiToken } from "@/lib/yango-token-onboarding";
import { upsertYangoTokenRegistryEntry } from "@/lib/yango-token-registry";
import type { AuthStoreData } from "@/types/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RegisterBody = {
  token?: unknown;
  tokenLabel?: unknown;
  clientName?: unknown;
  corpClientId?: unknown;
  adminName?: unknown;
  adminEmail?: unknown;
  adminPassword?: unknown;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function sanitizeEmailLocalPart(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

async function upsertTenantAdmin(input: {
  tenantName: string;
  corpClientId: string;
  tokenLabel: string;
  apiClientId: string;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
}) {
  const store = await loadAuthStore();
  const tenantAccounts = [...(store.tenantAccounts ?? [])];
  const existingTenant = tenantAccounts.find(
    (item) =>
      item.corpClientId === input.corpClientId ||
      (item.tokenLabel === input.tokenLabel && item.apiClientId === input.apiClientId),
  );
  const tenantId = existingTenant?.id ?? `tenant-${crypto.randomUUID()}`;
  const nextTenant = {
    id: tenantId,
    name: input.tenantName || input.adminName || input.corpClientId,
    corpClientId: input.corpClientId,
    tokenLabel: input.tokenLabel,
    apiClientId: input.apiClientId,
    defaultCostCenterId: existingTenant?.defaultCostCenterId ?? null,
    enabled: true,
    createdAt: existingTenant?.createdAt ?? new Date().toISOString(),
  };
  if (existingTenant) {
    const existingTenantIndex = tenantAccounts.findIndex((item) => item.id === existingTenant.id);
    tenantAccounts[existingTenantIndex] = nextTenant;
  } else {
    tenantAccounts.push(nextTenant);
  }

  const tenantRoles = { ...(store.tenantRoles ?? {}) };
  if (!tenantRoles[tenantId] || tenantRoles[tenantId].length === 0) {
    tenantRoles[tenantId] = [
      {
        id: "client-admin",
        name: "Client Admin",
        isDefault: true,
        permissions: {
          requestRides: true,
          orders: true,
          preOrders: true,
          communications: true,
          driversMap: true,
          employees: true,
        },
      },
      {
        id: "employee",
        name: "Employee",
        isDefault: true,
        permissions: {
          requestRides: true,
          orders: true,
          preOrders: true,
          communications: true,
          driversMap: true,
          employees: false,
        },
      },
    ];
  }

  const normalizedAdminEmail = input.adminEmail.toLowerCase();
  const existing = store.users.find((user) => user.email.toLowerCase() === normalizedAdminEmail);
  const users: AuthStoreData["users"] = existing
    ? store.users.map((user) =>
        user.id === existing.id
          ? {
              ...user,
              name: input.adminName || user.name,
              password: input.adminPassword || user.password,
              status: "approved",
              accountType: "client",
              tenantId,
              corpClientId: input.corpClientId,
              tokenLabel: input.tokenLabel,
              apiClientId: input.apiClientId,
              clientRoleId: "client-admin",
            }
          : user,
      )
    : [
        ...store.users,
        {
          id: `user-${crypto.randomUUID()}`,
          name: input.adminName || "Client Admin",
          email: normalizedAdminEmail,
          password: input.adminPassword,
          role: "User",
          status: "approved",
          createdAt: new Date().toISOString(),
          accountType: "client",
          tenantId,
          corpClientId: input.corpClientId,
          tokenLabel: input.tokenLabel,
          apiClientId: input.apiClientId,
          clientRoleId: "client-admin",
        },
      ];

  const existingEmails = new Set(users.map((user) => user.email.toLowerCase()));
  const existingPhonesInTenant = new Set(
    users
      .filter(
        (user) =>
          user.accountType === "client" &&
          user.tenantId === tenantId &&
          user.tokenLabel === input.tokenLabel &&
          user.apiClientId === input.apiClientId,
      )
      .map((user) => (user.phoneNumber ?? "").replace(/\D/g, ""))
      .filter(Boolean),
  );

  const yangoUsers = await listYangoClientUsers({
    tokenLabel: input.tokenLabel,
    clientId: input.apiClientId,
    limit: 1200,
  }).catch(() => []);
  let discoveredDefaultCostCenterId =
    yangoUsers.find((user) => (user.costCenterId ?? "").trim())?.costCenterId?.trim() ?? "";
  if (!discoveredDefaultCostCenterId) {
    discoveredDefaultCostCenterId =
      (await detectYangoDefaultCostCenterId({
        tokenLabel: input.tokenLabel,
        clientId: input.apiClientId,
      }).catch(() => null))?.trim() || "";
  }
  if (!discoveredDefaultCostCenterId) {
    const centers = await listYangoCostCenters({
      tokenLabel: input.tokenLabel,
      clientId: input.apiClientId,
    }).catch(() => []);
    if (centers.length > 0) {
      discoveredDefaultCostCenterId = centers[0]?.id?.trim() || "";
    }
  }

  for (const yangoUser of yangoUsers) {
    const phoneRaw = (yangoUser.phone ?? "").trim();
    const phoneDigits = phoneRaw.replace(/\D/g, "");
    if (!phoneDigits || existingPhonesInTenant.has(phoneDigits)) {
      continue;
    }
    const safeUserPart = sanitizeEmailLocalPart(yangoUser.userId || `legacy-${phoneDigits.slice(-6)}`);
    const safeTenantPart = sanitizeEmailLocalPart(tenantId);
    let candidateEmail = `${safeTenantPart}.${safeUserPart}@client.local`;
    let suffix = 1;
    while (existingEmails.has(candidateEmail.toLowerCase())) {
      candidateEmail = `${safeTenantPart}.${safeUserPart}.${suffix}@client.local`;
      suffix += 1;
    }
    existingEmails.add(candidateEmail.toLowerCase());
    existingPhonesInTenant.add(phoneDigits);
    const generatedPassword = `auto-${crypto.randomUUID()}`;
    users.push({
      id: `user-${crypto.randomUUID()}`,
      name: (yangoUser.fullName ?? "").trim() || phoneRaw || "Employee",
      email: candidateEmail,
      phoneNumber: phoneRaw || null,
      costCenterId: (yangoUser.costCenterId ?? "").trim() || null,
      password: generatedPassword,
      role: "User",
      status: "approved",
      createdAt: new Date().toISOString(),
      accountType: "client",
      tenantId,
      corpClientId: input.corpClientId,
      tokenLabel: input.tokenLabel,
      apiClientId: input.apiClientId,
      clientRoleId: "employee",
    });
    if (phoneRaw && yangoUser.userId) {
      upsertMappedUserId({
        tokenLabel: input.tokenLabel,
        clientId: input.apiClientId,
        phoneNumber: phoneRaw,
        userId: yangoUser.userId,
      });
    }
  }
  const nextTenantAccounts = tenantAccounts.map((tenant) =>
    tenant.id === tenantId && discoveredDefaultCostCenterId
      ? { ...tenant, defaultCostCenterId: discoveredDefaultCostCenterId }
      : tenant,
  );
  const nextUsers = discoveredDefaultCostCenterId
    ? users.map((user) =>
        user.accountType === "client" &&
        user.tenantId === tenantId &&
        user.tokenLabel === input.tokenLabel &&
        user.apiClientId === input.apiClientId &&
        (user.costCenterId == null || user.costCenterId.trim() === "")
          ? { ...user, costCenterId: discoveredDefaultCostCenterId }
          : user,
      )
    : users;

  await saveAuthStore({ ...store, users: nextUsers, tenantAccounts: nextTenantAccounts, tenantRoles });
  return { tenantId, adminEmail: normalizedAdminEmail };
}

export async function POST(request: Request) {
  const auth = await requireAdminUser(request);
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json()) as RegisterBody;
    const token = asString(body.token).trim();
    const requestedLabel = asString(body.tokenLabel).trim();
    const requestedClientName = asString(body.clientName).trim();
    const requestedCorpClientId = asString(body.corpClientId).trim();
    const adminName = asString(body.adminName).trim();
    const adminEmail = asString(body.adminEmail).trim();
    const adminPassword = asString(body.adminPassword).trim();
    if ((adminEmail && !adminPassword) || (!adminEmail && adminPassword)) {
      return Response.json(
        { ok: false, error: "Provide both admin email and admin password." },
        { status: 400 },
      );
    }

    let tokenLabel = "";
    let displayClientName = "";
    let apiClientId = "";
    let clientsPayload: Array<{ clientId: string; clientName: string }> = [];
    let saved:
      | {
          label: string;
          crmClientName: string;
          updatedAt: string;
        }
      | null = null;

    if (token) {
      const validated = await validateYangoApiToken(token);
      const persisted = await upsertYangoTokenRegistryEntry({
        label: requestedLabel || validated.suggestedLabel,
        crmClientName: requestedClientName || validated.suggestedClientName,
        token,
      });
      tokenLabel = persisted.label;
      displayClientName = persisted.crmClientName;
      apiClientId = validated.clients[0]?.clientId ?? "";
      clientsPayload = validated.clients;
      saved = {
        label: persisted.label,
        crmClientName: persisted.crmClientName,
        updatedAt: persisted.updatedAt,
      };
    } else {
      if (!requestedCorpClientId) {
        return Response.json(
          { ok: false, error: "Provide API token or corp_client_id." },
          { status: 400 },
        );
      }
      const clients = await getRequestRideApiClients();
      const matches = clients.filter((row) => row.clientId === requestedCorpClientId);
      if (matches.length === 0) {
        return Response.json(
          { ok: false, error: "No configured token found for this corp_client_id." },
          { status: 404 },
        );
      }
      const uniqueTokenLabels = [...new Set(matches.map((item) => item.tokenLabel))];
      if (uniqueTokenLabels.length > 1) {
        return Response.json(
          {
            ok: false,
            error:
              "Multiple API tokens are mapped to this corp_client_id. Please validate by API token to choose the required one.",
          },
          { status: 409 },
        );
      }
      const found = matches[0];
      tokenLabel = found.tokenLabel;
      displayClientName = requestedClientName || found.clientName;
      apiClientId = found.clientId;
      clientsPayload = [{ clientId: found.clientId, clientName: found.clientName }];
    }

    const corpClientId = requestedCorpClientId || apiClientId;
    const shouldCreateTenantAdmin = Boolean(adminEmail && adminPassword);
    const tenantResult =
      shouldCreateTenantAdmin && corpClientId && apiClientId
        ? await upsertTenantAdmin({
            tenantName: displayClientName,
            corpClientId,
            tokenLabel,
            apiClientId,
            adminName,
            adminEmail,
            adminPassword,
          })
        : null;

    revalidateTag("yango-preorders", "max");

    return Response.json(
      {
        ok: true,
        entry: {
          label: saved?.label ?? tokenLabel,
          clientName: saved?.crmClientName ?? displayClientName,
          updatedAt: saved?.updatedAt ?? new Date().toISOString(),
        },
        tenantAdmin:
          tenantResult != null
            ? {
                tenantId: tenantResult.tenantId,
                adminEmail: tenantResult.adminEmail,
              }
            : null,
        clients: clientsPayload,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message.trim() : "Failed to register API token.";
    return Response.json(
      { ok: false, error: relabelGoogleVendorForDisplay(msg || "Failed to register API token.") },
      { status: 400 },
    );
  }
}
