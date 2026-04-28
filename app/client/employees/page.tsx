"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";

type AuthApiEnvelope = { ok?: boolean; message?: string; data?: { users?: Array<Record<string, unknown>> } };

export default function ClientEmployeesPage() {
  const { currentUser, users } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [roleId, setRoleId] = useState("employee");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const tenantUsers = useMemo(
    () => users.filter((user) => user.accountType === "client" && user.tenantId === currentUser?.tenantId),
    [currentUser?.tenantId, users],
  );

  async function submitCreateEmployee() {
    if (!currentUser?.tenantId) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "createTenantEmployee",
          tenantId: currentUser.tenantId,
          name,
          email,
          password,
          clientRoleId: roleId,
        }),
      });
      const payload = (await response.json().catch(() => null)) as AuthApiEnvelope | null;
      if (!response.ok || !payload?.ok) {
        setMessage(payload?.message ?? `HTTP ${response.status}`);
        return;
      }
      setName("");
      setEmail("");
      setPassword("");
      setMessage("Employee created.");
    } finally {
      setBusy(false);
    }
  }

  async function updateEmployee(userId: string, nextRoleId: string, active: boolean) {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateTenantEmployee",
          userId,
          clientRoleId: nextRoleId,
          status: active ? "approved" : "rejected",
        }),
      });
      const payload = (await response.json().catch(() => null)) as AuthApiEnvelope | null;
      if (!response.ok || !payload?.ok) {
        setMessage(payload?.message ?? `HTTP ${response.status}`);
        return;
      }
      setMessage("Employee updated.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="crm-page mx-3 space-y-4">
      <div className="rounded-2xl border border-white/70 bg-white/85 p-4">
        <h1 className="text-lg font-semibold text-slate-900">Employees</h1>
        <p className="text-sm text-slate-600">Tenant: {currentUser?.corpClientId ?? "n/a"}</p>
        <div className="mt-3 grid gap-2 md:grid-cols-4">
          <input className="crm-input h-10 px-3 text-sm" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="crm-input h-10 px-3 text-sm" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className="crm-input h-10 px-3 text-sm" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <select className="crm-input h-10 px-3 text-sm" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
            <option value="employee">Employee</option>
            <option value="client-admin">Client Admin</option>
          </select>
        </div>
        <button disabled={busy} onClick={submitCreateEmployee} className="crm-button-primary mt-3 rounded-xl px-4 py-2 text-sm font-semibold">
          Add employee
        </button>
        {message ? <p className="mt-2 text-sm text-slate-600">{message}</p> : null}
      </div>

      <div className="rounded-2xl border border-white/70 bg-white/85 p-4">
        <h2 className="text-base font-semibold text-slate-900">Tenant users</h2>
        <div className="mt-3 space-y-2">
          {tenantUsers.map((user) => (
            <div key={user.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">{user.name}</p>
                <p className="text-xs text-slate-600">{user.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  className="crm-input h-9 px-2 text-xs"
                  defaultValue={user.clientRoleId ?? "employee"}
                  onChange={(e) => void updateEmployee(user.id, e.target.value, user.status !== "rejected")}
                >
                  <option value="employee">Employee</option>
                  <option value="client-admin">Client Admin</option>
                </select>
                <button
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
                  onClick={() => void updateEmployee(user.id, user.clientRoleId ?? "employee", user.status === "rejected")}
                >
                  {user.status === "rejected" ? "Activate" : "Deactivate"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
