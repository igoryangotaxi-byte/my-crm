"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { PageHeading } from "@/components/ui/PageHeading";
import type { AppPageKey, AppRole, BusinessArea } from "@/types/auth";

const roleItems: AppRole[] = ["Admin", "User", "Team Lead"];
type AccessAction =
  | { type: "page"; key: AppPageKey; label: string }
  | { type: "area"; key: BusinessArea; label: string };

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
      { type: "page", key: "preOrders", label: "Pre-Orders" },
      { type: "page", key: "orders", label: "Orders" },
      { type: "page", key: "priceCalculator", label: "Price Calculator" },
      { type: "page", key: "notes", label: "Notes" },
    ],
  },
  {
    key: "admin",
    label: "Administration",
    actions: [{ type: "page", key: "accesses", label: "Access managment" }],
  },
];

export default function AccessesPage() {
  const {
    currentUser,
    pendingUsers,
    users,
    rolePermissions,
    roleAreaAccess,
    updateUserStatus,
    updateUserRole,
    toggleRolePageAccess,
    toggleRoleAreaAccess,
  } = useAuth();

  const isAdmin = currentUser?.role === "Admin";
  const [selectedRole, setSelectedRole] = useState<AppRole>("Admin");
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
        return roleAreaAccess[role][action.key];
      }).length;
      return { role, allowedCount };
    });
  }, [rolePermissions, roleAreaAccess]);

  return (
    <section>
      <PageHeading
        title="Access managment"
        subtitle="Manage role permissions and registration approvals"
      />

      <div className="glass-surface mb-4 overflow-hidden rounded-3xl">
        <div className="grid min-h-[380px] grid-cols-1 divide-y divide-border lg:grid-cols-3 lg:divide-x lg:divide-y-0">
          <div className="p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Role</p>
            <div className="space-y-1.5">
              {roleItems.map((role) => {
                const isSelected = role === selectedRole;
                return (
                  <button
                    key={role}
                    type="button"
                    onClick={() => setSelectedRole(role)}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-medium transition ${
                      isSelected
                        ? "bg-[#ff4f38] text-white"
                        : "text-slate-700 hover:bg-slate-100"
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
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
              Section
            </p>
            <div className="space-y-1.5">
              {accessSections.map((section) => {
                const isSelected = section.key === selectedSection.key;
                return (
                  <button
                    key={section.key}
                    type="button"
                    onClick={() => setSelectedSectionKey(section.key)}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-medium transition ${
                      isSelected
                        ? "bg-[#ff4f38] text-white"
                        : "text-slate-700 hover:bg-slate-100"
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
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
              Allowed actions
            </p>
            <div className="space-y-2">
              {selectedSection.actions.map((action) => {
                const checked =
                  action.type === "page"
                    ? rolePermissions[selectedRole][action.key]
                    : roleAreaAccess[selectedRole][action.key];

                return (
                  <label
                    key={`${action.type}-${action.key}`}
                    className="flex items-center gap-3 rounded-xl border border-border bg-white px-3 py-2.5 text-sm text-slate-800"
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
                        toggleRoleAreaAccess(selectedRole, action.key);
                      }}
                      className="h-4 w-4 rounded border-border accent-[#ff4f38] disabled:opacity-50"
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
          <article key={item.role} className="glass-surface rounded-3xl px-4 py-3">
            <p className="text-sm text-muted">{item.role}</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">
              {item.allowedCount}/{accessSections.flatMap((section) => section.actions).length}
            </p>
            <p className="text-xs text-muted">actions allowed</p>
          </article>
        ))}
      </div>

      <div className="glass-surface mb-4 rounded-3xl p-4">
        <h2 className="text-base font-semibold text-slate-900">Pending registrations</h2>
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
                    className="h-9 rounded-lg border border-border bg-white px-2 text-sm text-slate-700 disabled:opacity-50"
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
                    className="rounded-lg bg-emerald-100 px-3 py-1.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-200 disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={!isAdmin}
                    onClick={() => updateUserStatus(user.id, "rejected")}
                    className="rounded-lg bg-rose-100 px-3 py-1.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-200 disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <details className="glass-surface mt-4 rounded-3xl p-4">
        <summary className="cursor-pointer text-sm font-semibold text-slate-800">
          All users ({users.length})
        </summary>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-[#f6f6f8]">
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
                      className="h-8 rounded-lg border border-border bg-white px-2 text-sm text-slate-700 disabled:opacity-50"
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
                    {isAdmin ? "Role can be updated" : "Admin only"}
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
