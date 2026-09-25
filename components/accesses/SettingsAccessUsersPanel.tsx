"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  APP_ROLES,
  CURRENT_PERMISSIONS_VERSION,
  effectivePageAccess,
  mergeRolePermissions,
  SALES_OPERATION_PAGE_KEYS,
} from "@/lib/role-permissions";
import type { AppPageKey, AppRole, AuthUser } from "@/types/auth";

const CRM_STACK_PAGES: Array<{ key: AppPageKey; label: string }> = [
  { key: "salesOperation", label: "CRM shell" },
  { key: "salesMySpace", label: "My Space" },
  { key: "salesPipeline", label: "Pipeline" },
  { key: "salesDriversPipeline", label: "Drivers Pipeline" },
  { key: "salesTracker", label: "Tracker" },
  { key: "salesDocumentation", label: "Documentation" },
  { key: "salesLeadDiscovery", label: "Lead Discovery" },
  { key: "salesAiAssistant", label: "Assistant" },
  { key: "salesCallCenter", label: "Call Center" },
  { key: "salesAstradial", label: "Astradial" },
  { key: "salesSignedClients", label: "Signed Clients" },
  { key: "salesB2BClients", label: "B2B Clients" },
  { key: "salesAnalytics", label: "Analytics" },
  { key: "salesManagerAnalytics", label: "Manager Analytics" },
  { key: "salesAutomation", label: "Automation" },
  { key: "salesSettings", label: "Settings" },
  { key: "preOrders", label: "Pre-Orders" },
  { key: "accesses", label: "Access mgmt" },
];

const MY_SPACE_ONLY_KEYS = new Set<AppPageKey>(["salesOperation", "salesMySpace"]);

function formatLastLogin(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return "—";
  }
}

function DeleteIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
      <path d="M5 5l10 10M15 5L5 15" />
    </svg>
  );
}

export function SettingsAccessUsersPanel() {
  const tSettings = useTranslations("salesOperation.settings");
  const tStore = useTranslations("auth.permissionStoreUnavailable");
  const {
    currentUser,
    users,
    rolePermissions,
    updateUserRole,
    setUserPageOverrides,
    setUserEnabled,
    deleteUser,
    createInternalUser,
    permissionStoreAdminBlocked,
  } = useAuth();

  const isAdmin = currentUser?.role === "Admin";
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({
    name: "",
    email: "",
    password: "",
    role: "User" as AppRole,
  });

  const mainCrmUsers = useMemo(
    () =>
      users
        .filter((user) => user.accountType !== "client" && user.status !== "pending")
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name)),
    [users],
  );

  const baselineFor = useCallback(
    (role: AppRole) =>
      mergeRolePermissions(role, rolePermissions[role], CURRENT_PERMISSIONS_VERSION),
    [rolePermissions],
  );

  const persistOverrides = useCallback(
    async (userId: string, pageOverrides: Partial<Record<AppPageKey, boolean>>) => {
      setSavingUserId(userId);
      setMessage(null);
      try {
        await setUserPageOverrides(userId, pageOverrides);
        setMessage(tSettings("saved"));
      } catch (err) {
        setMessage(err instanceof Error ? err.message : tSettings("saveError"));
      } finally {
        setSavingUserId(null);
      }
    },
    [setUserPageOverrides, tSettings],
  );

  const togglePage = useCallback(
    async (user: AuthUser, page: AppPageKey) => {
      if (user.role === "Admin") return;
      const baseline = baselineFor(user.role);
      const effective = effectivePageAccess(user, rolePermissions);
      const nextValue = !effective[page];
      const nextOverrides: Partial<Record<AppPageKey, boolean>> = {
        ...(user.pageOverrides ?? {}),
      };
      if (nextValue === Boolean(baseline[page])) {
        delete nextOverrides[page];
      } else {
        nextOverrides[page] = nextValue;
      }
      if (
        nextValue &&
        page !== "salesOperation" &&
        (SALES_OPERATION_PAGE_KEYS as readonly AppPageKey[]).includes(page) &&
        !baseline.salesOperation &&
        nextOverrides.salesOperation !== true
      ) {
        nextOverrides.salesOperation = true;
      }
      await persistOverrides(user.id, nextOverrides);
    },
    [baselineFor, persistOverrides, rolePermissions],
  );

  const applyPreset = useCallback(
    async (user: AuthUser, preset: "mySpace" | "allCrm") => {
      if (user.role === "Admin") return;
      const baseline = baselineFor(user.role);
      const nextOverrides: Partial<Record<AppPageKey, boolean>> = {
        ...(user.pageOverrides ?? {}),
      };
      for (const { key } of CRM_STACK_PAGES) {
        const desired = preset === "allCrm" ? true : MY_SPACE_ONLY_KEYS.has(key);
        if (desired === Boolean(baseline[key])) {
          delete nextOverrides[key];
        } else {
          nextOverrides[key] = desired;
        }
      }
      await persistOverrides(user.id, nextOverrides);
    },
    [baselineFor, persistOverrides],
  );

  return (
    <div className="space-y-4">
      {message ? (
        <p className="text-sm text-[var(--so-muted)]" role="status">
          {message}
        </p>
      ) : null}

      {isAdmin ? (
        <div className="so-card !p-4">
          <p className="text-sm font-semibold text-[var(--so-text)]">Create approved CRM user</p>
          <p className="mb-3 text-xs text-[var(--so-muted)]">
            New internal users become active immediately. User / Team Lead start with My Space only.
          </p>
          <div className="grid gap-2 md:grid-cols-4">
            <input
              type="text"
              value={draft.name}
              onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))}
              placeholder="Full name"
              className="crm-input h-9 px-3 text-sm"
            />
            <input
              type="email"
              value={draft.email}
              onChange={(e) => setDraft((p) => ({ ...p, email: e.target.value }))}
              placeholder="name@company.com"
              className="crm-input h-9 px-3 text-sm"
            />
            <input
              type="password"
              value={draft.password}
              onChange={(e) => setDraft((p) => ({ ...p, password: e.target.value }))}
              placeholder="Password"
              className="crm-input h-9 px-3 text-sm"
            />
            <select
              value={draft.role}
              onChange={(e) => setDraft((p) => ({ ...p, role: e.target.value as AppRole }))}
              className="crm-input h-9 px-3 text-sm"
            >
              {APP_ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            disabled={creating || permissionStoreAdminBlocked}
            onClick={async () => {
              setCreating(true);
              setMessage(null);
              try {
                const result = await createInternalUser(draft);
                setMessage(
                  result.message ?? (result.ok ? "CRM user created." : "Failed to create CRM user."),
                );
                if (result.ok) {
                  setDraft({ name: "", email: "", password: "", role: "User" });
                }
              } finally {
                setCreating(false);
              }
            }}
            className="crm-button-primary mt-3 rounded-[8px] px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {creating ? "Creating…" : "Create user"}
          </button>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-[12px] border border-[var(--so-border)]">
        <table className="min-w-full text-sm">
          <thead className="bg-[var(--so-surface-2)]">
            <tr>
              <th className="px-2 py-1.5 text-left text-xs font-medium text-muted">Name</th>
              <th className="px-2 py-1.5 text-left text-xs font-medium text-muted">Email</th>
              <th className="px-2 py-1.5 text-left text-xs font-medium text-muted">Role</th>
              <th className="px-2 py-1.5 text-left text-xs font-medium text-muted">Status</th>
              <th className="px-2 py-1.5 text-left text-xs font-medium text-muted">Last login</th>
              <th className="px-2 py-1.5 text-left text-xs font-medium text-muted">Access</th>
              <th className="px-2 py-1.5 text-left text-xs font-medium text-muted">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--so-border)]">
            {mainCrmUsers.map((user) => {
              const isAdminRow = user.role === "Admin";
              const effective = effectivePageAccess(user, rolePermissions);
              const enabled = user.status === "approved";
              const busy = savingUserId === user.id;
              const expanded = expandedUserId === user.id;

              return (
                <tr key={user.id} className="align-top hover:bg-[var(--so-surface-hover)]">
                  <td className="px-2 py-2 font-medium text-[var(--so-text)]">{user.name}</td>
                  <td className="px-2 py-2 text-[var(--so-muted)]">{user.email}</td>
                  <td className="px-2 py-2">
                    <select
                      value={user.role}
                      disabled={!isAdmin || busy || permissionStoreAdminBlocked}
                      title={
                        permissionStoreAdminBlocked ? tStore("adminSaveDisabledTooltip") : undefined
                      }
                      onChange={(e) => {
                        void (async () => {
                          setSavingUserId(user.id);
                          try {
                            await updateUserRole(user.id, e.target.value as AppRole);
                            setMessage(tSettings("saved"));
                          } catch (err) {
                            setMessage(err instanceof Error ? err.message : tSettings("saveError"));
                          } finally {
                            setSavingUserId(null);
                          }
                        })();
                      }}
                      className="crm-input h-8 px-2 text-sm disabled:opacity-50"
                    >
                      {APP_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    <label className="inline-flex items-center gap-2 text-xs font-medium">
                      <input
                        type="checkbox"
                        checked={enabled}
                        disabled={!isAdmin || busy || permissionStoreAdminBlocked || isAdminRow}
                        onChange={(e) => {
                          void (async () => {
                            setSavingUserId(user.id);
                            setMessage(null);
                            try {
                              await setUserEnabled(user.id, e.target.checked);
                              setMessage(tSettings("saved"));
                            } catch (err) {
                              setMessage(
                                err instanceof Error ? err.message : tSettings("saveError"),
                              );
                            } finally {
                              setSavingUserId(null);
                            }
                          })();
                        }}
                        className="h-4 w-4 rounded border-border accent-accent disabled:opacity-50"
                      />
                      {enabled ? "Active" : "Disabled"}
                    </label>
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap text-xs text-[var(--so-muted)]">
                    {formatLastLogin(user.lastLoginAt)}
                  </td>
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedUserId((prev) => (prev === user.id ? null : user.id))
                      }
                      className="so-focus-ring rounded-[8px] border border-[var(--so-border-strong)] bg-[var(--so-surface)] px-2 py-1 text-xs font-semibold text-[var(--so-text)] hover:bg-[var(--so-surface-hover)]"
                    >
                      {expanded ? "Hide stack" : "CRM stack"}
                    </button>
                    {expanded ? (
                      <div className="mt-2 min-w-[220px] space-y-2 rounded-[10px] border border-[var(--so-border)] bg-[var(--so-surface)] p-2">
                        {isAdminRow ? (
                          <p className="text-xs text-[var(--so-muted)]">
                            Admin always has full CRM access.
                          </p>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            <button
                              type="button"
                              disabled={!isAdmin || busy}
                              onClick={() => void applyPreset(user, "mySpace")}
                              className="rounded-[6px] border border-[var(--so-border-strong)] px-2 py-0.5 text-[11px] font-semibold disabled:opacity-50"
                            >
                              My Space only
                            </button>
                            <button
                              type="button"
                              disabled={!isAdmin || busy}
                              onClick={() => void applyPreset(user, "allCrm")}
                              className="rounded-[6px] border border-[var(--so-border-strong)] px-2 py-0.5 text-[11px] font-semibold disabled:opacity-50"
                            >
                              Grant all CRM
                            </button>
                          </div>
                        )}
                        <div className="grid max-h-48 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
                          {CRM_STACK_PAGES.map(({ key, label }) => (
                            <label
                              key={key}
                              className="flex items-center gap-2 rounded-[6px] px-1.5 py-1 text-xs text-[var(--so-text)]"
                            >
                              <input
                                type="checkbox"
                                checked={Boolean(effective[key])}
                                disabled={
                                  !isAdmin ||
                                  busy ||
                                  isAdminRow ||
                                  permissionStoreAdminBlocked
                                }
                                onChange={() => void togglePage(user, key)}
                                className="h-3.5 w-3.5 rounded border-border accent-accent disabled:opacity-50"
                              />
                              {label}
                            </label>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </td>
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      aria-label={`Delete ${user.email}`}
                      disabled={!isAdmin || currentUser?.id === user.id}
                      onClick={async () => {
                        setMessage(null);
                        try {
                          await deleteUser(user.id);
                          setMessage(`Removed platform access for ${user.email}.`);
                        } catch (err) {
                          setMessage(
                            err instanceof Error ? err.message : "Failed to remove platform access.",
                          );
                        }
                      }}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-rose-300/80 bg-gradient-to-b from-rose-500 to-red-600 text-white disabled:opacity-45"
                    >
                      <DeleteIcon />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
