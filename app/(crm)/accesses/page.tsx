"use client";

import { useMemo } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { PageHeading } from "@/components/ui/PageHeading";
import type { AppPageKey, AppRole } from "@/types/auth";

const pageItems: { key: AppPageKey; label: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "clients", label: "Clients" },
  { key: "orders", label: "Orders" },
  { key: "preOrders", label: "Pre-Orders" },
  { key: "priceCalculator", label: "Price Calculator" },
  { key: "accesses", label: "Accesses" },
];

const roleItems: AppRole[] = ["Admin", "User", "Team Lead"];

export default function AccessesPage() {
  const {
    currentUser,
    pendingUsers,
    users,
    rolePermissions,
    updateUserStatus,
    updateUserRole,
    toggleRolePageAccess,
    setAllRoleAccess,
  } = useAuth();

  const isAdmin = currentUser?.role === "Admin";

  const roleStats = useMemo(() => {
    return roleItems.map((role) => {
      const allowedCount = pageItems.filter((page) => rolePermissions[role][page.key]).length;
      return { role, allowedCount };
    });
  }, [rolePermissions]);

  return (
    <section>
      <PageHeading
        title="Accesses"
        subtitle="Manage role permissions and registration approvals"
      />

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

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        {roleStats.map((item) => (
          <article key={item.role} className="glass-surface rounded-3xl px-4 py-3">
            <p className="text-sm text-muted">{item.role}</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">
              {item.allowedCount}/{pageItems.length}
            </p>
            <p className="text-xs text-muted">pages allowed</p>
          </article>
        ))}
      </div>

      <div className="glass-surface overflow-hidden rounded-3xl">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-[#f6f6f8]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                  Page
                </th>
                {roleItems.map((role) => (
                  <th
                    key={role}
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span>{role}</span>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          disabled={!isAdmin}
                          onClick={() => setAllRoleAccess(role, true)}
                          className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 disabled:opacity-50"
                        >
                          All
                        </button>
                        <button
                          type="button"
                          disabled={!isAdmin}
                          onClick={() => setAllRoleAccess(role, false)}
                          className="rounded-md bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 disabled:opacity-50"
                        >
                          None
                        </button>
                      </div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pageItems.map((page) => (
                <tr key={page.key} className="hover:bg-[#fafafb]">
                  <td className="px-4 py-3 text-sm font-medium text-slate-900">{page.label}</td>
                  {roleItems.map((role) => (
                    <td key={role} className="px-4 py-3">
                      <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={rolePermissions[role][page.key]}
                          disabled={!isAdmin}
                          onChange={() => toggleRolePageAccess(role, page.key)}
                          className="h-4 w-4 rounded border-border accent-accent disabled:opacity-50"
                        />
                        <span>{rolePermissions[role][page.key] ? "Allowed" : "Denied"}</span>
                      </label>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
