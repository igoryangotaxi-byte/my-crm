"use client";

import { useMemo, useState } from "react";

type ValidationClient = {
  clientId: string;
  clientName: string;
};

type ValidationResult = {
  clients: ValidationClient[];
  suggestedLabel: string;
  suggestedClientName: string;
};

type ExistingTokenInfo = {
  source: "registry" | "env";
  label: string;
  clientName: string | null;
  envKey?: string;
};

type ApiResponse<T> = {
  ok: boolean;
  error?: string;
  result?: T;
  existing?: ExistingTokenInfo | null;
  entry?: { label: string; clientName: string; updatedAt: string };
  tenantAdmin?: {
    tenantId: string;
    adminEmail: string;
    defaultCostCenterId?: string | null;
  } | null;
  onboardingWarnings?: string[];
};

type CorpLookupResult = {
  tokenLabel: string;
  clientId: string;
  clientName: string;
};

export function TokenOnboardingPanel() {
  const [apiToken, setApiToken] = useState("");
  const [tokenLabel, setTokenLabel] = useState("");
  const [clientName, setClientName] = useState("");
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [corpClientId, setCorpClientId] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [existingTokenInfo, setExistingTokenInfo] = useState<ExistingTokenInfo | null>(null);
  const [lookupResult, setLookupResult] = useState<CorpLookupResult | null>(null);
  const [onboardingWarnings, setOnboardingWarnings] = useState<string[]>([]);

  const canValidate = useMemo(() => apiToken.trim().length > 8, [apiToken]);
  const canSave = useMemo(
    () =>
      Boolean(validation) &&
      tokenLabel.trim().length > 0 &&
      clientName.trim().length > 0 &&
      (apiToken.trim().length > 8 || Boolean(lookupResult)),
    [validation, apiToken, tokenLabel, clientName, lookupResult],
  );
  const isCabinetOnlyMode = Boolean(lookupResult) && apiToken.trim().length === 0;

  async function validateToken() {
    setIsValidating(true);
    setError(null);
    setSuccess(null);
    setValidation(null);
    setExistingTokenInfo(null);
    setLookupResult(null);
    try {
      const response = await fetch("/api/yango-token-onboarding/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: apiToken }),
      });
      const payload = (await response.json()) as ApiResponse<ValidationResult>;
      if (!response.ok || !payload.ok || !payload.result) {
        throw new Error(payload.error || "Failed to validate token.");
      }
      setValidation(payload.result);
      setExistingTokenInfo(payload.existing ?? null);
      setTokenLabel(payload.result.suggestedLabel);
      setClientName(payload.result.suggestedClientName);
      setCorpClientId(payload.result.clients[0]?.clientId ?? "");
    } catch (validationError) {
      setError(validationError instanceof Error ? validationError.message : "Validation failed.");
    } finally {
      setIsValidating(false);
    }
  }

  async function findByCorpClientId() {
    setError(null);
    setSuccess(null);
    setValidation(null);
    setExistingTokenInfo(null);
    setLookupResult(null);
    try {
      const response = await fetch("/api/yango-token-onboarding/find-by-corp-client", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ corpClientId }),
      });
      const payload = (await response.json()) as ApiResponse<CorpLookupResult>;
      if (!response.ok || !payload.ok || !payload.result) {
        throw new Error(payload.error || "No token found for corp_client_id.");
      }
      setLookupResult(payload.result);
      setTokenLabel(payload.result.tokenLabel);
      setClientName(payload.result.clientName);
      setValidation({
        clients: [{ clientId: payload.result.clientId, clientName: payload.result.clientName }],
        suggestedLabel: payload.result.tokenLabel,
        suggestedClientName: payload.result.clientName,
      });
      setSuccess(
        `Found existing token ${payload.result.tokenLabel} for corp_client_id ${payload.result.clientId}.`,
      );
    } catch (lookupError) {
      setError(lookupError instanceof Error ? lookupError.message : "Lookup failed.");
    }
  }

  async function registerToken() {
    setIsSaving(true);
    setError(null);
    setSuccess(null);
    setOnboardingWarnings([]);
    try {
      const response = await fetch("/api/yango-token-onboarding/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: apiToken,
          tokenLabel,
          clientName,
          corpClientId,
          adminName,
          adminEmail,
          adminPassword,
        }),
      });
      const payload = (await response.json()) as ApiResponse<ValidationResult>;
      if (!response.ok || !payload.ok || !payload.entry) {
        throw new Error(payload.error || "Failed to register token.");
      }
      if (payload.onboardingWarnings && payload.onboardingWarnings.length > 0) {
        setOnboardingWarnings(payload.onboardingWarnings);
      }
      const adminPart = payload.tenantAdmin
        ? ` Admin login created: ${payload.tenantAdmin.adminEmail}.`
        : "";
      setSuccess(
        isCabinetOnlyMode
          ? `Client cabinet created for ${payload.entry.clientName} (${payload.entry.label}).${adminPart}`
          : `Client ${payload.entry.clientName} (${payload.entry.label}) added successfully.${adminPart}`,
      );
      setApiToken("");
      setValidation(null);
      setExistingTokenInfo(null);
      setAdminName("");
      setAdminEmail("");
      setAdminPassword("");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to register token.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="glass-surface mb-4 rounded-3xl p-4">
      <div className="mb-3">
        <h3 className="crm-section-title">Add client by API token</h3>
        <p className="crm-subtitle">
          Validate token ownership, then save it to live token registry for all CRM flows.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-slate-600">
          API token
          <input
            value={apiToken}
            onChange={(event) => setApiToken(event.target.value)}
            placeholder="y0__..."
            className="rounded-xl border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
          />
        </label>
        <div className="flex items-end">
          <button
            type="button"
            onClick={validateToken}
            disabled={!canValidate || isValidating}
            className="inline-flex h-10 items-center justify-center rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isValidating ? "Validating..." : "Validate token"}
          </button>
        </div>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-slate-600">
          Find by corp_client_id
          <input
            value={corpClientId}
            onChange={(event) => setCorpClientId(event.target.value)}
            placeholder="corp_client_id"
            className="rounded-xl border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
          />
        </label>
        <div className="flex items-end">
          <button
            type="button"
            onClick={findByCorpClientId}
            disabled={!corpClientId.trim()}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-white px-4 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Find existing token
          </button>
        </div>
      </div>

      {validation ? (
        <div className="mt-3 space-y-3 rounded-2xl border border-slate-200 bg-white/80 p-3">
          {existingTokenInfo ? (
            <div className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <p className="font-semibold">This token is already configured.</p>
              <p>
                Label: {existingTokenInfo.label}
                {existingTokenInfo.clientName ? `, Client: ${existingTokenInfo.clientName}` : ""}
              </p>
              <p>
                Source: {existingTokenInfo.source}
                {existingTokenInfo.envKey ? ` (${existingTokenInfo.envKey})` : ""}
              </p>
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs text-slate-600">
              Token label
              <input
                value={tokenLabel}
                onChange={(event) => setTokenLabel(event.target.value)}
                className="rounded-xl border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-600">
              Client name in CRM
              <input
                value={clientName}
                onChange={(event) => setClientName(event.target.value)}
                className="rounded-xl border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
              />
            </label>
            <div className="text-xs text-slate-600">
              <p className="mb-1 font-semibold">corp_client_id</p>
              <p className="rounded-xl border border-border bg-white px-3 py-2 text-sm text-slate-900">
                {corpClientId || "Not set"}
              </p>
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-700">
            <p className="mb-1 font-semibold">Token owners from auth/list:</p>
            <ul className="space-y-0.5">
              {validation.clients.map((client) => (
                <li key={client.clientId}>
                  {client.clientName} ({client.clientId})
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl bg-slate-50 px-3 py-2">
            <p className="mb-2 text-xs font-semibold text-slate-700">
              Optional: create admin login for this token
            </p>
            <div className="grid gap-3 md:grid-cols-3">
              <label className="flex flex-col gap-1 text-xs text-slate-600">
                Admin name
                <input
                  value={adminName}
                  onChange={(event) => setAdminName(event.target.value)}
                  className="rounded-xl border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-slate-600">
                Admin email
                <input
                  value={adminEmail}
                  onChange={(event) => setAdminEmail(event.target.value)}
                  className="rounded-xl border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-slate-600">
                Admin password
                <input
                  type="password"
                  value={adminPassword}
                  onChange={(event) => setAdminPassword(event.target.value)}
                  className="rounded-xl border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                />
              </label>
            </div>
          </div>

          <button
            type="button"
            onClick={registerToken}
            disabled={!canSave || isSaving}
            className="inline-flex h-10 items-center justify-center rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving
              ? "Saving..."
              : isCabinetOnlyMode
                ? "Create client cabinet"
                : "Add client everywhere"}
          </button>
        </div>
      ) : null}

      {error ? <p className="mt-3 text-xs font-semibold text-rose-700">{error}</p> : null}
      {onboardingWarnings.length > 0 ? (
        <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          <p className="mb-1 font-semibold">Onboarding notice</p>
          <ul className="list-inside list-disc space-y-1">
            {onboardingWarnings.map((line, index) => (
              <li key={`${index}-${line.slice(0, 48)}`}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {success ? <p className="mt-3 text-xs font-semibold text-emerald-700">{success}</p> : null}
    </section>
  );
}
