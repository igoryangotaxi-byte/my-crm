"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";

type AuthApiEnvelope = { ok?: boolean; message?: string; data?: { users?: Array<Record<string, unknown>> } };
type EmployeeActivityRow = {
  userId: string;
  fullName: string;
  phone: string | null;
  department: string | null;
  rides: number;
  cancelled: number;
  spend: number;
  averageCheck: number;
  lastRoutes: string[];
  controls: {
    ordersAllowed: boolean;
    allowedRideClasses: string[];
    updatedAt?: string | null;
  };
};

type EmployeeActivityResponse = {
  ok: boolean;
  items: EmployeeActivityRow[];
};

export default function ClientEmployeesPage() {
  const { currentUser, users } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [roleId, setRoleId] = useState("employee");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [editingPhones, setEditingPhones] = useState<Record<string, string>>({});
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [activityRows, setActivityRows] = useState<EmployeeActivityRow[]>([]);
  const [showActivity, setShowActivity] = useState(false);
  const [phoneSearch, setPhoneSearch] = useState("");
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));

  const tenantUsers = useMemo(
    () => users.filter((user) => user.accountType === "client" && user.tenantId === currentUser?.tenantId),
    [currentUser?.tenantId, users],
  );
  const filteredTenantUsers = useMemo(() => {
    const digits = phoneSearch.replace(/\D/g, "");
    if (!digits) return tenantUsers;
    return tenantUsers.filter((user) => (user.phoneNumber ?? "").replace(/\D/g, "").includes(digits));
  }, [phoneSearch, tenantUsers]);

  const loadActivity = async () => {
    setActivityLoading(true);
    setActivityError(null);
    try {
      const since = new Date(`${fromDate}T00:00:00.000Z`).toISOString();
      const till = new Date(`${toDate}T23:59:59.999Z`).toISOString();
      const response = await fetch(
        `/api/client-employees-activity?since=${encodeURIComponent(since)}&till=${encodeURIComponent(till)}`,
      );
      const payload = (await response.json().catch(() => null)) as EmployeeActivityResponse | null;
      if (!response.ok || !payload?.ok) {
        throw new Error("Failed to load employee activity.");
      }
      setActivityRows(payload.items ?? []);
    } catch (error) {
      setActivityError(error instanceof Error ? error.message : "Failed to load employee activity.");
    } finally {
      setActivityLoading(false);
    }
  };

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
          phoneNumber,
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
      setPhoneNumber("");
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

  async function updateEmployeePhone(userId: string) {
    const nextPhone = (editingPhones[userId] ?? "").trim();
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateTenantEmployee",
          userId,
          phoneNumber: nextPhone,
        }),
      });
      const payload = (await response.json().catch(() => null)) as AuthApiEnvelope | null;
      if (!response.ok || !payload?.ok) {
        setMessage(payload?.message ?? `HTTP ${response.status}`);
        return;
      }
      setMessage("Phone updated.");
    } finally {
      setBusy(false);
    }
  }

  async function updateEmployeeControls(userId: string, next: { ordersAllowed: boolean }) {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/client-employees-activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          ordersAllowed: next.ordersAllowed,
          allowedRideClasses: [],
        }),
      });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !payload?.ok) {
        setMessage(payload?.error ?? `HTTP ${response.status}`);
        return;
      }
      setActivityRows((prev) =>
        prev.map((row) =>
          row.userId === userId
            ? { ...row, controls: { ...row.controls, ordersAllowed: next.ordersAllowed } }
            : row,
        ),
      );
      setMessage("Employee restrictions updated.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="crm-page space-y-4">
      <div className="rounded-2xl border border-white/70 bg-white/85 p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">My employees</h1>
            <p className="text-sm text-slate-600">
              Ride activity, cancellation rate, average check and quick order restrictions.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-slate-600">
              From
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="crm-input mt-1 h-10 px-3 text-sm"
              />
            </label>
            <label className="text-xs text-slate-600">
              To
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="crm-input mt-1 h-10 px-3 text-sm"
              />
            </label>
            <button
              type="button"
              onClick={() => {
                setShowActivity(true);
                void loadActivity();
              }}
              disabled={activityLoading}
              className="crm-button-primary h-10 rounded-xl px-4 text-sm font-semibold"
            >
              {activityLoading ? "Loading..." : "Show activity"}
            </button>
          </div>
        </div>
        {activityError ? <p className="mt-2 text-sm text-rose-700">{activityError}</p> : null}
      </div>

      {showActivity ? (
      <div className="grid gap-3 xl:grid-cols-2">
        {activityRows.map((employee) => (
          <article
            key={employee.userId}
            className="rounded-2xl border border-white/70 bg-white/85 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-900">{employee.fullName}</p>
                <p className="text-xs text-slate-600">
                  ID: {employee.userId}
                  {employee.phone ? ` · ${employee.phone}` : ""}
                  {employee.department ? ` · ${employee.department}` : ""}
                </p>
              </div>
              <div className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">
                {employee.rides} rides
              </div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-xl border border-slate-200 bg-white p-2">
                <p className="text-slate-500">Spend</p>
                <p className="font-semibold text-slate-900">{employee.spend.toFixed(2)}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-2">
                <p className="text-slate-500">Avg check</p>
                <p className="font-semibold text-slate-900">{employee.averageCheck.toFixed(2)}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-2">
                <p className="text-slate-500">Cancelled</p>
                <p className="font-semibold text-slate-900">{employee.cancelled}</p>
              </div>
            </div>

            <div className="mt-3 space-y-2">
              <label className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                <span className="font-medium text-slate-800">Allow new orders</span>
                <input
                  type="checkbox"
                  checked={employee.controls.ordersAllowed}
                  onChange={(event) =>
                    void updateEmployeeControls(employee.userId, {
                      ordersAllowed: event.target.checked,
                    })
                  }
                  className="h-4 w-4 rounded border-slate-300 accent-red-600"
                />
              </label>
            </div>

            <div className="mt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Last routes
              </p>
              <ul className="mt-1 space-y-1 text-xs text-slate-700">
                {employee.lastRoutes.length > 0 ? (
                  employee.lastRoutes.map((route, idx) => <li key={`${employee.userId}-${idx}`}>{route}</li>)
                ) : (
                  <li>No recent routes</li>
                )}
              </ul>
            </div>
          </article>
        ))}
        {activityRows.length === 0 && !activityLoading ? (
          <div className="rounded-2xl border border-white/70 bg-white/85 p-4 text-sm text-slate-600">
            No employee activity for selected range.
          </div>
        ) : null}
      </div>
      ) : null}

      <div className="rounded-2xl border border-white/70 bg-white/85 p-4">
        <h1 className="text-lg font-semibold text-slate-900">Employees</h1>
        <p className="text-sm text-slate-600">Tenant: {currentUser?.corpClientId ?? "n/a"}</p>
        <div className="mt-3 grid gap-2 md:grid-cols-4">
          <input className="crm-input h-10 px-3 text-sm" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="crm-input h-10 px-3 text-sm" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className="crm-input h-10 px-3 text-sm" placeholder="+972..." value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} />
          <input className="crm-input h-10 px-3 text-sm" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div className="mt-2 grid gap-2 md:grid-cols-4">
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
        <h2 className="text-base font-semibold text-slate-900">Users</h2>
        <div className="mt-2">
          <input
            className="crm-input h-9 w-full max-w-sm px-3 text-sm"
            placeholder="Search by phone"
            value={phoneSearch}
            onChange={(event) => setPhoneSearch(event.target.value)}
          />
        </div>
        <div className="mt-3 space-y-2">
          {filteredTenantUsers.map((user) => (
            <div key={user.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">{user.name}</p>
                <p className="text-xs text-slate-600">
                  {user.email}
                  {user.phoneNumber ? ` · ${user.phoneNumber}` : ""}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    className="crm-input h-9 w-48 px-2 text-xs"
                    placeholder="+972..."
                    value={editingPhones[user.id] ?? user.phoneNumber ?? ""}
                    onChange={(e) =>
                      setEditingPhones((prev) => ({
                        ...prev,
                        [user.id]: e.target.value,
                      }))
                    }
                  />
                  <button
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
                    onClick={() => void updateEmployeePhone(user.id)}
                    disabled={busy}
                  >
                    Save phone
                  </button>
                </div>
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
          {filteredTenantUsers.length === 0 ? (
            <p className="text-sm text-slate-500">No employees found for this phone.</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
