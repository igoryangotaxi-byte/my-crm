"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import type {
  AppPageKey,
  AppRole,
  BusinessArea,
  ClientRoleDefinition,
  DashboardBlockKey,
  TenantAccount,
} from "@/types/auth";

const roleItems: AppRole[] = ["Admin", "User", "Team Lead"];
type AccessAction =
  | { type: "page"; key: AppPageKey; label: string }
  | { type: "area"; key: BusinessArea; label: string }
  | { type: "dashboardBlock"; key: DashboardBlockKey; label: string };

type AccessSection = {
  key: string;
  label: string;
  actions: AccessAction[];
};

const accessSections: AccessSection[] = [
  {
    key: "platform",
    label: "Platform",
    actions: [
      { type: "area", key: "b2b", label: "B2B access" },
      { type: "area", key: "b2c", label: "B2C access" },
    ],
  },
  {
    key: "b2b-pages",
    label: "B2B pages",
    actions: [
      { type: "page", key: "dashboard", label: "Dashboard" },
      { type: "page", key: "requestRides", label: "Request Rides" },
      { type: "page", key: "preOrders", label: "Pre-Orders" },
      { type: "page", key: "orders", label: "Orders" },
      { type: "page", key: "communications", label: "Communications" },
      { type: "page", key: "priceCalculator", label: "Price Calculator" },
      { type: "page", key: "notes", label: "Notes" },
    ],
  },
  {
    key: "b2c-pages",
    label: "B2C pages",
    actions: [{ type: "page", key: "driversMap", label: "Drivers on the Map" }],
  },
  {
    key: "dashboard-blocks",
    label: "Feature blocks",
    actions: [
      { type: "dashboardBlock", key: "apiData", label: "API Data block" },
      { type: "dashboardBlock", key: "yangoData", label: "Yango Data block" },
      {
        type: "dashboardBlock",
        key: "tariffHealthCheck",
        label: "Tariff Health Check tab",
      },
    ],
  },
  {
    key: "admin",
    label: "Administration",
    actions: [{ type: "page", key: "accesses", label: "Access management" }],
  },
];
const COMMUNICATIONS_ROLE_SUFFIX = "__communications";

function DeleteIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
      <path d="M5 5l10 10M15 5L5 15" />
    </svg>
  );
}

export default function AccessesPage() {
  const {
    currentUser,
    pendingUsers,
    users,
    rolePermissions,
    roleAreaAccess,
    roleDashboardBlockAccess,
    updateUserStatus,
    updateUserRole,
    deleteUser,
    toggleRolePageAccess,
    toggleRoleAreaAccess,
    toggleRoleDashboardBlockAccess,
  } = useAuth();

  const isAdmin = currentUser?.role === "Admin";
  const [selectedRole, setSelectedRole] = useState<AppRole>("Admin");
  const [onboardingMessage, setOnboardingMessage] = useState<string | null>(null);
  const [tenantAccounts, setTenantAccounts] = useState<TenantAccount[]>([]);
  const [tenantRoles, setTenantRoles] = useState<Record<string, ClientRoleDefinition[]>>({});
  const [cabinetMessage, setCabinetMessage] = useState<string | null>(null);
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [cabinetUsersExpanded, setCabinetUsersExpanded] = useState(false);
  const [cabinetUsersPhoneQuery, setCabinetUsersPhoneQuery] = useState("");
  const [cabinetUsersVisibleCount, setCabinetUsersVisibleCount] = useState(10);
  const [globalB2CDraft, setGlobalB2CDraft] = useState({
    enabled: false,
    token: "",
    clientId: "",
    rideClass: "comfortplus",
    createEndpoint: "",
  });
  const [b2cDrafts, setB2cDrafts] = useState<
    Record<string, { enabled: boolean; token: string; clientId: string; rideClass: string; createEndpoint: string }>
  >({});
  const [newUserDrafts, setNewUserDrafts] = useState<
    Record<string, { name: string; email: string; password: string; roleId: string }>
  >({});
  const [selectedSectionKey, setSelectedSectionKey] = useState<string>(
    accessSections[0]?.key ?? "platform",
  );
  const selectedSection =
    accessSections.find((section) => section.key === selectedSectionKey) ??
    accessSections[0];
  const isCommunicationsRole = (roleId: string) => roleId.endsWith(COMMUNICATIONS_ROLE_SUFFIX);
  const getBaseRoleId = (roleId: string) =>
    isCommunicationsRole(roleId)
      ? roleId.slice(0, roleId.length - COMMUNICATIONS_ROLE_SUFFIX.length)
      : roleId;

  const fetchTenantData = useCallback(async () => {
    const response = await fetch("/api/auth", { cache: "no-store" });
    if (!response.ok) return;
    const payload = (await response.json()) as {
      tenantAccounts?: TenantAccount[];
      tenantRoles?: Record<string, ClientRoleDefinition[]>;
      globalB2CSettings?: {
        enabled?: boolean;
        token?: string | null;
        clientId?: string | null;
        rideClass?: string | null;
        createEndpoint?: string | null;
      };
    };
    setTenantAccounts(payload.tenantAccounts ?? []);
    setTenantRoles(payload.tenantRoles ?? {});
    setGlobalB2CDraft({
      enabled: payload.globalB2CSettings?.enabled === true,
      token: payload.globalB2CSettings?.token ?? "",
      clientId: payload.globalB2CSettings?.clientId ?? "",
      rideClass: payload.globalB2CSettings?.rideClass ?? "comfortplus",
      createEndpoint: payload.globalB2CSettings?.createEndpoint ?? "",
    });
  }, []);

  const callAuthAction = useCallback(
    async (body: Record<string, unknown>) => {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.message ?? `HTTP ${response.status}`);
      }
      await fetchTenantData();
    },
    [fetchTenantData],
  );

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void fetchTenantData();
    }, 0);
    return () => {
      window.clearTimeout(timerId);
    };
  }, [fetchTenantData]);

  const roleStats = useMemo(() => {
    const allActions = accessSections.flatMap((section) => section.actions);
    return roleItems.map((role) => {
      const allowedCount = allActions.filter((action) => {
        if (action.type === "page") {
          return rolePermissions[role][action.key];
        }
        if (action.type === "area") {
          return roleAreaAccess[role][action.key];
        }
        return roleDashboardBlockAccess[role][action.key];
      }).length;
      return { role, allowedCount };
    });
  }, [rolePermissions, roleAreaAccess, roleDashboardBlockAccess]);

  const mainCrmUsers = useMemo(
    () => users.filter((user) => user.accountType !== "client"),
    [users],
  );

  const tenantUsersById = useMemo(() => {
    const map = new Map<string, typeof users>();
    for (const tenant of tenantAccounts) {
      map.set(
        tenant.id,
        users.filter((user) => user.accountType === "client" && user.tenantId === tenant.id),
      );
    }
    return map;
  }, [tenantAccounts, users]);
  const selectedTenant = useMemo(
    () => tenantAccounts.find((tenant) => tenant.id === selectedTenantId) ?? null,
    [tenantAccounts, selectedTenantId],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setCabinetUsersExpanded(false);
      setCabinetUsersPhoneQuery("");
      setCabinetUsersVisibleCount(10);
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [selectedTenantId]);

  return (
    <section className="crm-page">
      <div className="glass-surface mb-4 rounded-3xl border border-white/70 bg-white/75 p-4 shadow-[0_16px_34px_rgba(15,23,42,0.08)] backdrop-blur-md">
        <h2 className="crm-section-title">Global B2C fallback (main CRM)</h2>
        <p className="mt-1 text-sm text-slate-600">
          This single B2C account is used for `Order B2C` actions triggered from the main CRM.
        </p>
        <div className="mt-3 grid gap-2 md:grid-cols-5">
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={globalB2CDraft.enabled}
              onChange={(event) =>
                setGlobalB2CDraft((prev) => ({ ...prev, enabled: event.target.checked }))
              }
            />
            Enabled
          </label>
          <input
            className="crm-input h-10 px-3 text-sm"
            placeholder="B2C API token"
            value={globalB2CDraft.token}
            onChange={(event) => setGlobalB2CDraft((prev) => ({ ...prev, token: event.target.value }))}
          />
          <input
            className="crm-input h-10 px-3 text-sm"
            placeholder="B2C clientId (optional)"
            value={globalB2CDraft.clientId}
            onChange={(event) =>
              setGlobalB2CDraft((prev) => ({ ...prev, clientId: event.target.value }))
            }
          />
          <input
            className="crm-input h-10 px-3 text-sm"
            placeholder="Ride class (Comfort+)"
            value={globalB2CDraft.rideClass}
            onChange={(event) =>
              setGlobalB2CDraft((prev) => ({ ...prev, rideClass: event.target.value }))
            }
          />
          <input
            className="crm-input h-10 px-3 text-sm"
            placeholder="Create endpoint override (optional)"
            value={globalB2CDraft.createEndpoint}
            onChange={(event) =>
              setGlobalB2CDraft((prev) => ({ ...prev, createEndpoint: event.target.value }))
            }
          />
        </div>
        <button
          type="button"
          disabled={!isAdmin}
          onClick={async () => {
            try {
              await callAuthAction({
                action: "updateGlobalB2CSettings",
                enabled: globalB2CDraft.enabled,
                token: globalB2CDraft.token,
                clientId: globalB2CDraft.clientId,
                rideClass: globalB2CDraft.rideClass,
                createEndpoint: globalB2CDraft.createEndpoint,
              });
              setOnboardingMessage("Global B2C fallback account saved.");
            } catch (error) {
              setOnboardingMessage(
                error instanceof Error ? error.message : "Failed to save global B2C fallback settings.",
              );
            }
          }}
          className="crm-button-primary mt-3 rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          Save global B2C account
        </button>
      </div>

      <div className="glass-surface mb-4 overflow-hidden rounded-3xl border border-white/70 bg-white/75 shadow-[0_16px_34px_rgba(15,23,42,0.08)] backdrop-blur-md">
        <div className="grid min-h-[380px] grid-cols-1 divide-y divide-border lg:grid-cols-3 lg:divide-x lg:divide-y-0">
          <div className="p-4">
            <p className="crm-label mb-3">Role</p>
            <div className="space-y-1.5">
              {roleItems.map((role) => {
                const isSelected = role === selectedRole;
                return (
                  <button
                    key={role}
                    type="button"
                    onClick={() => setSelectedRole(role)}
                    className={`crm-hover-lift flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-medium transition ${
                      isSelected
                        ? "crm-button-primary text-white"
                        : "bg-white/55 text-slate-700 hover:bg-white"
                    }`}
                  >
                    <span>{role}</span>
                    <span className={isSelected ? "text-white/80" : "text-slate-400"}>›</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="p-4">
            <p className="crm-label mb-3">Section</p>
            <div className="space-y-1.5">
              {accessSections.map((section) => {
                const isSelected = section.key === selectedSection.key;
                return (
                  <button
                    key={section.key}
                    type="button"
                    onClick={() => setSelectedSectionKey(section.key)}
                    className={`crm-hover-lift flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-medium transition ${
                      isSelected
                        ? "crm-button-primary text-white"
                        : "bg-white/55 text-slate-700 hover:bg-white"
                    }`}
                  >
                    <span>{section.label}</span>
                    <span className={isSelected ? "text-white/80" : "text-slate-400"}>›</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="p-4">
            <p className="crm-label mb-3">Allowed actions</p>
            <div className="space-y-2">
              {selectedSection.actions.map((action) => {
                const checked =
                  action.type === "page"
                    ? rolePermissions[selectedRole][action.key]
                    : action.type === "area"
                      ? roleAreaAccess[selectedRole][action.key]
                      : roleDashboardBlockAccess[selectedRole][action.key];

                return (
                  <label
                    key={`${action.type}-${action.key}`}
                    className="crm-hover-lift flex items-center gap-3 rounded-xl border border-white/70 bg-white/70 px-3 py-2.5 text-sm text-slate-800"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!isAdmin}
                      onChange={() => {
                        if (action.type === "page") {
                          toggleRolePageAccess(selectedRole, action.key);
                          return;
                        }
                        if (action.type === "area") {
                          toggleRoleAreaAccess(selectedRole, action.key);
                          return;
                        }
                        toggleRoleDashboardBlockAccess(selectedRole, action.key);
                      }}
                      className="h-4 w-4 rounded border-border accent-accent disabled:opacity-50"
                    />
                    <span>{action.label}</span>
                  </label>
                );
              })}
              {!isAdmin ? (
                <p className="pt-1 text-xs text-muted">
                  Only Admin can modify access settings.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        {roleStats.map((item) => (
          <article key={item.role} className="glass-surface crm-hover-lift rounded-3xl border border-white/70 bg-white/75 px-4 py-3 shadow-[0_12px_28px_rgba(15,23,42,0.08)] backdrop-blur-md">
            <p className="crm-subtitle">{item.role}</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">
              {item.allowedCount}/{accessSections.flatMap((section) => section.actions).length}
            </p>
            <p className="crm-subtitle">actions allowed</p>
          </article>
        ))}
      </div>

      <div className="glass-surface mb-4 rounded-3xl border border-white/70 bg-white/75 p-4 shadow-[0_16px_34px_rgba(15,23,42,0.08)] backdrop-blur-md">
        <h2 className="crm-section-title">Pending registrations</h2>
        {pendingUsers.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No users are waiting for approval.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {pendingUsers.map((user) => (
              <div
                key={user.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-white px-3 py-2.5"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">{user.name}</p>
                  <p className="text-xs text-muted">{user.email}</p>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={user.role}
                    onChange={(event) => updateUserRole(user.id, event.target.value as AppRole)}
                    disabled={!isAdmin}
                    className="crm-input h-9 px-2 text-sm text-slate-700 disabled:opacity-50"
                  >
                    {roleItems.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={!isAdmin}
                    onClick={() => updateUserStatus(user.id, "approved")}
                    className="crm-button-primary rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={!isAdmin}
                    onClick={() => updateUserStatus(user.id, "rejected")}
                    className="crm-hover-lift rounded-lg border border-white/70 bg-white/75 px-3 py-1.5 text-sm font-semibold text-slate-700 transition disabled:opacity-50"
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${user.email}`}
                    disabled={!isAdmin || currentUser?.id === user.id}
                    onClick={() => deleteUser(user.id)}
                    className="crm-hover-lift inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-300/80 bg-gradient-to-b from-rose-500 to-red-600 text-white shadow-[0_10px_18px_rgba(225,29,72,0.32)] transition disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <DeleteIcon />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <details className="glass-surface mt-4 rounded-3xl border border-white/70 bg-white/75 p-4 shadow-[0_16px_34px_rgba(15,23,42,0.08)] backdrop-blur-md">
        <summary className="crm-section-title cursor-pointer">
          Clients Cabinet ({tenantAccounts.length})
        </summary>
        <div className="mt-3 space-y-3">
          <button
            type="button"
            onClick={() => void fetchTenantData()}
            className="crm-hover-lift rounded-lg border border-white/70 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Refresh client cabinets
          </button>
          {tenantAccounts.length === 0 ? (
            <p className="text-sm text-muted">No client cabinets created yet.</p>
          ) : null}
          {tenantAccounts.map((tenant) => {
            const tenantUsers = tenantUsersById.get(tenant.id) ?? [];
            return (
              <button
                key={tenant.id}
                type="button"
                onClick={() => setSelectedTenantId(tenant.id)}
                className="w-full rounded-2xl border border-border bg-white p-3 text-left transition hover:bg-slate-50"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{tenant.name}</p>
                    <p className="text-xs text-slate-500">
                      corp_client_id: {tenant.corpClientId} | token: {tenant.tokenLabel}
                    </p>
                  </div>
                  <span className="text-xs text-slate-500">Users: {tenantUsers.length}</span>
                </div>
              </button>
            );
          })}
          {cabinetMessage ? <p className="text-sm text-slate-600">{cabinetMessage}</p> : null}
        </div>
      </details>
      {selectedTenant ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-8 backdrop-blur-sm"
          onClick={() => setSelectedTenantId(null)}
        >
          <div
            className="crm-modal-surface w-full max-w-5xl rounded-3xl p-4"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-semibold text-slate-900">{selectedTenant.name}</h3>
                <p className="text-xs text-slate-500">
                  corp_client_id: {selectedTenant.corpClientId} | token: {selectedTenant.tokenLabel}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTenantId(null)}
                className="crm-hover-lift inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/80 text-lg font-semibold leading-none text-slate-700"
                aria-label="Close modal"
              >
                ×
              </button>
            </div>
            {(() => {
              const tenantUsers = tenantUsersById.get(selectedTenant.id) ?? [];
              const normalizedPhoneQuery = cabinetUsersPhoneQuery.replace(/\D/g, "");
              const filteredTenantUsers = normalizedPhoneQuery
                ? tenantUsers.filter((user) =>
                    (user.phoneNumber ?? "").replace(/\D/g, "").includes(normalizedPhoneQuery),
                  )
                : tenantUsers;
              const visibleTenantUsers = filteredTenantUsers.slice(0, cabinetUsersVisibleCount);
              const hasMoreTenantUsers = visibleTenantUsers.length < filteredTenantUsers.length;
              const roles = tenantRoles[selectedTenant.id] ?? [];
              const baseRoles = roles.filter((role) => !isCommunicationsRole(role.id));
              const b2cDraft = b2cDrafts[selectedTenant.id] ?? {
                enabled: selectedTenant.b2cEnabled === true,
                token: selectedTenant.b2cToken ?? "",
                clientId: selectedTenant.b2cClientId ?? "",
                rideClass: selectedTenant.b2cRideClass ?? "comfortplus",
                createEndpoint: selectedTenant.b2cCreateEndpoint ?? "",
              };
              const draft = newUserDrafts[selectedTenant.id] ?? {
                name: "",
                email: "",
                password: "",
                roleId: baseRoles.find((role) => role.id === "employee")?.id ?? baseRoles[0]?.id ?? "employee",
              };
              const ensureCommunicationsRoleId = async (baseRoleId: string) => {
                const baseRole =
                  roles.find((role) => role.id === baseRoleId) ??
                  baseRoles.find((role) => role.id === baseRoleId) ??
                  null;
                if (!baseRole) return baseRoleId;
                const commRoleId = `${baseRole.id}${COMMUNICATIONS_ROLE_SUFFIX}`;
                const existing = roles.find((role) => role.id === commRoleId);
                if (existing) return existing.id;
                await callAuthAction({
                  action: "upsertTenantRole",
                  tenantId: selectedTenant.id,
                  roleId: commRoleId,
                  name: `${baseRole.name} + Communications`,
                  permissions: {
                    ...baseRole.permissions,
                    communications: true,
                  },
                });
                await fetchTenantData();
                return commRoleId;
              };
              return (
                <div className="space-y-3">
                  <div className="rounded-2xl border border-border bg-white p-3">
                    <p className="text-sm font-semibold text-slate-900">B2C fallback account</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Used by `Order B2C` in pre-orders for this client (main CRM + client cabinet).
                    </p>
                    <div className="mt-2 grid gap-2 md:grid-cols-5">
                      <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-700">
                        <input
                          type="checkbox"
                          checked={b2cDraft.enabled}
                          onChange={(event) =>
                            setB2cDrafts((prev) => ({
                              ...prev,
                              [selectedTenant.id]: { ...b2cDraft, enabled: event.target.checked },
                            }))
                          }
                        />
                        Enabled
                      </label>
                      <input
                        className="crm-input h-9 px-2 text-sm"
                        placeholder="B2C API token"
                        value={b2cDraft.token}
                        onChange={(event) =>
                          setB2cDrafts((prev) => ({
                            ...prev,
                            [selectedTenant.id]: { ...b2cDraft, token: event.target.value },
                          }))
                        }
                      />
                      <input
                        className="crm-input h-9 px-2 text-sm"
                        placeholder="B2C clientId (optional)"
                        value={b2cDraft.clientId}
                        onChange={(event) =>
                          setB2cDrafts((prev) => ({
                            ...prev,
                            [selectedTenant.id]: { ...b2cDraft, clientId: event.target.value },
                          }))
                        }
                      />
                      <input
                        className="crm-input h-9 px-2 text-sm"
                        placeholder="Ride class (Comfort+)"
                        value={b2cDraft.rideClass}
                        onChange={(event) =>
                          setB2cDrafts((prev) => ({
                            ...prev,
                            [selectedTenant.id]: { ...b2cDraft, rideClass: event.target.value },
                          }))
                        }
                      />
                      <input
                        className="crm-input h-9 px-2 text-sm"
                        placeholder="Create endpoint override (optional)"
                        value={b2cDraft.createEndpoint}
                        onChange={(event) =>
                          setB2cDrafts((prev) => ({
                            ...prev,
                            [selectedTenant.id]: { ...b2cDraft, createEndpoint: event.target.value },
                          }))
                        }
                      />
                    </div>
                    <button
                      type="button"
                      disabled={!isAdmin}
                      onClick={async () => {
                        try {
                          await callAuthAction({
                            action: "updateTenantB2CSettings",
                            tenantId: selectedTenant.id,
                            b2cEnabled: b2cDraft.enabled,
                            b2cToken: b2cDraft.token,
                            b2cClientId: b2cDraft.clientId,
                            b2cRideClass: b2cDraft.rideClass,
                            b2cCreateEndpoint: b2cDraft.createEndpoint,
                          });
                          setCabinetMessage("B2C fallback account saved.");
                        } catch (error) {
                          setCabinetMessage(
                            error instanceof Error ? error.message : "Failed to save B2C settings.",
                          );
                        }
                      }}
                      className="crm-button-primary mt-2 rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
                    >
                      Save B2C account
                    </button>
                  </div>
                  <div className="rounded-2xl border border-border bg-white p-3">
                    <p className="text-sm font-semibold text-slate-900">Client cabinet menu</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Turn off sections for everyone in this cabinet (sidebar and direct links). Changes apply
                      immediately.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-4">
                      <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={selectedTenant.clientPortalCommunicationsEnabled !== false}
                          disabled={!isAdmin}
                          onChange={async (event) => {
                            try {
                              await callAuthAction({
                                action: "updateTenantPortalSections",
                                tenantId: selectedTenant.id,
                                clientPortalCommunicationsEnabled: event.target.checked,
                                clientPortalFinancialCenterEnabled:
                                  selectedTenant.clientPortalFinancialCenterEnabled !== false,
                              });
                              setCabinetMessage("Communications section updated.");
                            } catch (error) {
                              setCabinetMessage(
                                error instanceof Error ? error.message : "Failed to update Communications.",
                              );
                            }
                          }}
                          className="h-4 w-4 rounded border-border accent-accent disabled:opacity-50"
                        />
                        Communications
                      </label>
                      <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={selectedTenant.clientPortalFinancialCenterEnabled !== false}
                          disabled={!isAdmin}
                          onChange={async (event) => {
                            try {
                              await callAuthAction({
                                action: "updateTenantPortalSections",
                                tenantId: selectedTenant.id,
                                clientPortalCommunicationsEnabled:
                                  selectedTenant.clientPortalCommunicationsEnabled !== false,
                                clientPortalFinancialCenterEnabled: event.target.checked,
                              });
                              setCabinetMessage("Financial Center section updated.");
                            } catch (error) {
                              setCabinetMessage(
                                error instanceof Error ? error.message : "Failed to update Financial Center.",
                              );
                            }
                          }}
                          className="h-4 w-4 rounded border-border accent-accent disabled:opacity-50"
                        />
                        Financial Center
                      </label>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-border bg-white p-3">
                    <button
                      type="button"
                      onClick={() => {
                        setCabinetUsersExpanded((prev) => !prev);
                        if (!cabinetUsersExpanded) setCabinetUsersVisibleCount(10);
                      }}
                      className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm font-semibold text-slate-900"
                    >
                      <span>Cabinet users ({tenantUsers.length})</span>
                      <span className="text-xs text-slate-500">
                        {cabinetUsersExpanded ? "Hide" : "Show first 10"}
                      </span>
                    </button>
                    {cabinetUsersExpanded ? (
                      <div className="mt-3 space-y-3">
                        <input
                          className="crm-input h-9 w-full px-3 text-sm"
                          placeholder="Search by phone across all users"
                          value={cabinetUsersPhoneQuery}
                          onChange={(event) => {
                            setCabinetUsersPhoneQuery(event.target.value);
                            setCabinetUsersVisibleCount(10);
                          }}
                        />
                        <div className="overflow-x-auto">
                          <table className="min-w-full">
                            <thead className="bg-white/60">
                              <tr>
                                <th className="px-2 py-1 text-left text-xs font-semibold uppercase tracking-wide text-muted">Name</th>
                                <th className="px-2 py-1 text-left text-xs font-semibold uppercase tracking-wide text-muted">Email</th>
                                <th className="px-2 py-1 text-left text-xs font-semibold uppercase tracking-wide text-muted">Access</th>
                                <th className="px-2 py-1 text-left text-xs font-semibold uppercase tracking-wide text-muted">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                              {visibleTenantUsers.map((user) => (
                                <tr key={user.id}>
                                  <td className="px-2 py-1.5 text-sm text-slate-900">{user.name}</td>
                                  <td className="px-2 py-1.5 text-sm text-slate-700">{user.email}</td>
                                  <td className="px-2 py-1.5 text-sm text-slate-700">
                                    <select
                                      value={getBaseRoleId(user.clientRoleId ?? "employee")}
                                      disabled={!isAdmin}
                                      onChange={async (event) => {
                                        try {
                                          const currentRole = roles.find(
                                            (role) => role.id === (user.clientRoleId ?? "employee"),
                                          );
                                          const communicationsEnabled = Boolean(
                                            currentRole?.permissions?.communications,
                                          );
                                          const nextBaseRoleId = event.target.value;
                                          const nextRoleId = communicationsEnabled
                                            ? await ensureCommunicationsRoleId(nextBaseRoleId)
                                            : nextBaseRoleId;
                                          await callAuthAction({
                                            action: "updateTenantEmployee",
                                            userId: user.id,
                                            clientRoleId: nextRoleId,
                                          });
                                          setCabinetMessage("Client user access updated.");
                                        } catch (error) {
                                          setCabinetMessage(
                                            error instanceof Error ? error.message : "Failed to update access.",
                                          );
                                        }
                                      }}
                                      className="crm-input h-8 px-2 text-sm text-slate-700 disabled:opacity-50"
                                    >
                                      {baseRoles.map((role) => (
                                        <option key={role.id} value={role.id}>
                                          {role.name}
                                        </option>
                                      ))}
                                    </select>
                                    {selectedTenant.clientPortalCommunicationsEnabled === false ? null : (
                                      <label className="ml-2 inline-flex items-center gap-1.5 text-xs text-slate-600">
                                        <input
                                          type="checkbox"
                                          disabled={!isAdmin}
                                          checked={Boolean(
                                            roles.find((role) => role.id === (user.clientRoleId ?? "employee"))
                                              ?.permissions?.communications,
                                          )}
                                          onChange={async (event) => {
                                            try {
                                              const baseRoleId = getBaseRoleId(user.clientRoleId ?? "employee");
                                              const targetRoleId = event.target.checked
                                                ? await ensureCommunicationsRoleId(baseRoleId)
                                                : baseRoleId;
                                              await callAuthAction({
                                                action: "updateTenantEmployee",
                                                userId: user.id,
                                                clientRoleId: targetRoleId,
                                              });
                                              setCabinetMessage("Communications access updated.");
                                            } catch (error) {
                                              setCabinetMessage(
                                                error instanceof Error
                                                  ? error.message
                                                  : "Failed to update communications access.",
                                              );
                                            }
                                          }}
                                        />
                                        Communications
                                      </label>
                                    )}
                                  </td>
                                  <td className="px-2 py-1.5 text-sm text-slate-700">
                                    <button
                                      type="button"
                                      aria-label={`Delete ${user.email}`}
                                      disabled={!isAdmin || currentUser?.id === user.id}
                                      onClick={() => deleteUser(user.id)}
                                      className="crm-hover-lift inline-flex h-7 w-7 items-center justify-center rounded-md border border-rose-300/80 bg-gradient-to-b from-rose-500 to-red-600 text-white shadow-[0_8px_16px_rgba(225,29,72,0.3)] transition disabled:cursor-not-allowed disabled:opacity-45"
                                    >
                                      <DeleteIcon />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {filteredTenantUsers.length === 0 ? (
                          <p className="text-xs text-slate-500">No users found for this phone query.</p>
                        ) : null}
                        {hasMoreTenantUsers ? (
                          <button
                            type="button"
                            onClick={() => setCabinetUsersVisibleCount((prev) => prev + 10)}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700"
                          >
                            Load more
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <div className="grid gap-2 md:grid-cols-5">
                    <input
                      className="crm-input h-9 px-2 text-sm"
                      placeholder="Name"
                      value={draft.name}
                      onChange={(event) =>
                        setNewUserDrafts((prev) => ({
                          ...prev,
                          [selectedTenant.id]: { ...draft, name: event.target.value },
                        }))
                      }
                    />
                    <input
                      className="crm-input h-9 px-2 text-sm"
                      placeholder="Email"
                      value={draft.email}
                      onChange={(event) =>
                        setNewUserDrafts((prev) => ({
                          ...prev,
                          [selectedTenant.id]: { ...draft, email: event.target.value },
                        }))
                      }
                    />
                    <input
                      className="crm-input h-9 px-2 text-sm"
                      placeholder="Password"
                      type="password"
                      value={draft.password}
                      onChange={(event) =>
                        setNewUserDrafts((prev) => ({
                          ...prev,
                          [selectedTenant.id]: { ...draft, password: event.target.value },
                        }))
                      }
                    />
                    <select
                      className="crm-input h-9 px-2 text-sm"
                      value={draft.roleId}
                      onChange={(event) =>
                        setNewUserDrafts((prev) => ({
                          ...prev,
                          [selectedTenant.id]: { ...draft, roleId: event.target.value },
                        }))
                      }
                    >
                      {baseRoles.map((role) => (
                        <option key={role.id} value={role.id}>
                          {role.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={!isAdmin}
                      onClick={async () => {
                        try {
                          await callAuthAction({
                            action: "createTenantEmployee",
                            tenantId: selectedTenant.id,
                            name: draft.name,
                            email: draft.email,
                            password: draft.password,
                            clientRoleId: draft.roleId || "employee",
                          });
                          setCabinetMessage("Client cabinet user added.");
                          setNewUserDrafts((prev) => ({
                            ...prev,
                            [selectedTenant.id]: { ...draft, name: "", email: "", password: "" },
                          }));
                        } catch (error) {
                          setCabinetMessage(
                            error instanceof Error ? error.message : "Failed to add client user.",
                          );
                        }
                      }}
                      className="crm-button-primary rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
                    >
                      Add user
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      ) : null}

      <details className="glass-surface mt-4 rounded-3xl border border-white/70 bg-white/75 p-4 shadow-[0_16px_34px_rgba(15,23,42,0.08)] backdrop-blur-md">
        <summary className="crm-section-title cursor-pointer">
          Main CRM Users ({mainCrmUsers.length})
        </summary>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-white/60">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                  Name
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                  Email
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                  Role
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                  Status
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {mainCrmUsers.map((user) => (
                <tr key={user.id}>
                  <td className="px-3 py-2 text-sm text-slate-900">{user.name}</td>
                  <td className="px-3 py-2 text-sm text-slate-700">{user.email}</td>
                  <td className="px-3 py-2 text-sm text-slate-700">
                    <select
                      value={user.role}
                      disabled={!isAdmin}
                      onChange={(event) =>
                        updateUserRole(user.id, event.target.value as AppRole)
                      }
                      className="crm-input h-8 px-2 text-sm text-slate-700 disabled:opacity-50"
                    >
                      {roleItems.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-sm text-slate-700">{user.status}</td>
                  <td className="px-3 py-2 text-sm text-slate-700">
                    <div className="flex items-center gap-2">
                      <span>{isAdmin ? "Role can be updated" : "Admin only"}</span>
                      <button
                        type="button"
                        aria-label={`Delete ${user.email}`}
                        disabled={!isAdmin || currentUser?.id === user.id}
                        onClick={() => deleteUser(user.id)}
                        className="crm-hover-lift inline-flex h-7 w-7 items-center justify-center rounded-md border border-rose-300/80 bg-gradient-to-b from-rose-500 to-red-600 text-white shadow-[0_8px_16px_rgba(225,29,72,0.3)] transition disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <DeleteIcon />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
