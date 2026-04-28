"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import type { AppPageKey, AppRole, BusinessArea, DashboardBlockKey } from "@/types/auth";

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
  const [tenantName, setTenantName] = useState("");
  const [corpClientId, setCorpClientId] = useState("");
  const [tokenLabel, setTokenLabel] = useState("");
  const [apiClientId, setApiClientId] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [onboardingMessage, setOnboardingMessage] = useState<string | null>(null);
  const [selectedSectionKey, setSelectedSectionKey] = useState<string>(
    accessSections[0]?.key ?? "platform",
  );
  const selectedSection =
    accessSections.find((section) => section.key === selectedSectionKey) ??
    accessSections[0];

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

  return (
    <section className="crm-page">
      <div className="glass-surface mb-4 rounded-3xl border border-white/70 bg-white/75 p-4 shadow-[0_16px_34px_rgba(15,23,42,0.08)] backdrop-blur-md">
        <h2 className="crm-section-title">Client onboarding bridge</h2>
        <p className="mt-1 text-sm text-slate-600">
          Bind tenant to `corp_client_id`, `tokenLabel`, `clientId` and create the primary client admin.
        </p>
        <div className="mt-3 grid gap-2 md:grid-cols-4">
          <input className="crm-input h-10 px-3 text-sm" placeholder="Tenant name" value={tenantName} onChange={(e) => setTenantName(e.target.value)} />
          <input className="crm-input h-10 px-3 text-sm" placeholder="corp_client_id" value={corpClientId} onChange={(e) => setCorpClientId(e.target.value)} />
          <input className="crm-input h-10 px-3 text-sm" placeholder="tokenLabel" value={tokenLabel} onChange={(e) => setTokenLabel(e.target.value)} />
          <input className="crm-input h-10 px-3 text-sm" placeholder="clientId" value={apiClientId} onChange={(e) => setApiClientId(e.target.value)} />
          <input className="crm-input h-10 px-3 text-sm" placeholder="Primary admin name" value={adminName} onChange={(e) => setAdminName(e.target.value)} />
          <input className="crm-input h-10 px-3 text-sm" placeholder="Primary admin email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} />
          <input className="crm-input h-10 px-3 text-sm" placeholder="Primary admin password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} />
        </div>
        <button
          type="button"
          disabled={!isAdmin}
          onClick={async () => {
            const response = await fetch("/api/auth", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "upsertTenantAccount",
                name: tenantName,
                corpClientId,
                tokenLabel,
                apiClientId,
                primaryAdminName: adminName,
                primaryAdminEmail: adminEmail,
                primaryAdminPassword: adminPassword,
              }),
            });
            const payload = (await response.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
            setOnboardingMessage(response.ok && payload?.ok ? "Tenant onboarding saved." : payload?.message ?? `HTTP ${response.status}`);
          }}
          className="crm-button-primary mt-3 rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          Save onboarding
        </button>
        {onboardingMessage ? <p className="mt-2 text-sm text-slate-600">{onboardingMessage}</p> : null}
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
          All users ({users.length})
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
              {users.map((user) => (
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
