"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { AstradialDialer } from "@/components/telephony/AstradialDialer";
import { AstradialRecentCalls } from "@/components/telephony/AstradialRecentCalls";
import { cn } from "@/lib/ui/cn";

type StatusPayload = {
  ok?: boolean;
  telephonyEnabled?: boolean;
  provider?: string;
  astradialConfigured?: boolean;
  supabaseConfigured?: boolean;
  linked?: boolean;
  liveCount?: number;
  agent?: {
    extension: string;
    status: string;
    providerUserId: string | null;
  } | null;
  error?: string;
};

const STATUSES = ["available", "busy", "break", "offline"] as const;

export function AstradialSettingsView() {
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [extension, setExtension] = useState("");
  const [providerUserId, setProviderUserId] = useState("");
  const [agentStatus, setAgentStatus] = useState<string>("offline");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/telephony/status", { cache: "no-store" });
    const json = (await res.json()) as StatusPayload & { code?: string };
    if (json.code === "telephony_disabled") {
      setStatus({ ok: true, telephonyEnabled: false });
      return;
    }
    if (!res.ok || !json.ok) {
      setError(json.error ?? "Failed to load Astradial status.");
      setStatus(json);
      return;
    }
    setStatus(json);
    setExtension(json.agent?.extension ?? "");
    setProviderUserId(json.agent?.providerUserId ?? "");
    setAgentStatus(json.agent?.status ?? "offline");
  }, []);

  useEffect(() => {
    void load().finally(() => setLoading(false));
  }, [load]);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/telephony/agent", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          extension: extension.trim(),
          providerUserId: providerUserId.trim() || null,
          status: agentStatus,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Save failed.");
        return;
      }
      setMessage("Extension linked.");
      await load();
    } finally {
      setSaving(false);
    }
  };

  const disconnect = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/telephony/agent", { method: "DELETE" });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Disconnect failed.");
        return;
      }
      setExtension("");
      setProviderUserId("");
      setMessage("Unlinked.");
      await load();
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-[var(--so-muted)]">Loading…</p>;
  }

  if (status && status.telephonyEnabled === false) {
    return (
      <section className="so-card space-y-2 p-5">
        <h2 className="ycds-h3 text-[var(--so-text)]">Astradial</h2>
        <p className="text-sm text-[var(--so-muted)]">
          Telephony is disabled (`TELEPHONY_ENABLED=false`). Existing CRM features are unaffected.
        </p>
      </section>
    );
  }

  return (
    <div className="mx-auto grid max-w-3xl gap-4">
      <section className="so-card space-y-4 p-5">
        <div>
          <h2 className="ycds-h3 text-[var(--so-text)]">Astradial</h2>
          <p className="mt-1 text-sm text-[var(--so-muted)]">
            Link your SIP extension. Audio stays on your desk phone or softphone — Appli controls
            click-to-call and screen-pop.
          </p>
        </div>
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--so-border)] pb-2">
            <span className="text-[var(--so-muted)]">Provider</span>
            <span className="text-[var(--so-text)]">{status?.provider ?? "—"}</span>
          </div>
          <div className="flex items-center justify-between gap-3 border-b border-[var(--so-border)] pb-2">
            <span className="text-[var(--so-muted)]">Astradial API</span>
            <span className="text-[var(--so-text)]">
              {status?.astradialConfigured ? "Configured" : "Missing env"}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 border-b border-[var(--so-border)] pb-2">
            <span className="text-[var(--so-muted)]">Link</span>
            <span className="text-[var(--so-text)]">
              {status?.linked && status.agent?.extension
                ? `Extension ${status.agent.extension}`
                : "Not linked"}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 border-b border-[var(--so-border)] pb-2">
            <span className="text-[var(--so-muted)]">Live channels</span>
            <span className="text-[var(--so-text)]">{status?.liveCount ?? 0}</span>
          </div>
        </div>
        {!status?.supabaseConfigured ? (
          <p className="text-sm text-[var(--destructive)]">
            Supabase is required to save extension mapping. Apply{" "}
            <code className="text-xs">scripts/sql/supabase_telephony_astradial.sql</code>.
          </p>
        ) : null}
        {!status?.astradialConfigured ? (
          <p className="text-sm text-[var(--so-muted)]">
            Astradial PBX is not connected yet (`ASTRADIAL_API_URL` missing). Dial on drivers still
            uses 3CX Call Center until the PBX URL is set. You can still link an extension for when
            Astradial comes online.
          </p>
        ) : null}
      </section>

      <section className="so-card space-y-3 p-5">
        <h3 className="ycds-h3 text-[var(--so-text)]">Your extension</h3>
        <label className="grid gap-1.5 text-sm">
          <span className="text-[var(--so-muted)]">Extension</span>
          <input
            value={extension}
            onChange={(e) => setExtension(e.target.value)}
            placeholder="e.g. 1001"
            className="h-9 rounded-[8px] border border-[var(--so-border-strong)] bg-[var(--so-surface)] px-3 text-[var(--so-text)] outline-none focus:border-[var(--so-accent)]"
            inputMode="numeric"
            autoComplete="off"
          />
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="text-[var(--so-muted)]">Astradial user id (optional)</span>
          <input
            value={providerUserId}
            onChange={(e) => setProviderUserId(e.target.value)}
            placeholder="Provider user id"
            className="h-9 rounded-[8px] border border-[var(--so-border-strong)] bg-[var(--so-surface)] px-3 text-[var(--so-text)] outline-none focus:border-[var(--so-accent)]"
            autoComplete="off"
          />
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="text-[var(--so-muted)]">Status</span>
          <select
            value={agentStatus}
            onChange={(e) => setAgentStatus(e.target.value)}
            className="h-9 rounded-[8px] border border-[var(--so-border-strong)] bg-[var(--so-surface)] px-3 text-[var(--so-text)] outline-none focus:border-[var(--so-accent)]"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => void save()}
            disabled={saving || !extension.trim() || !status?.supabaseConfigured}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
          {status?.linked ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => void disconnect()}
              disabled={saving}
            >
              Disconnect
            </Button>
          ) : null}
        </div>
        {message ? <p className="text-sm text-[var(--so-text)]">{message}</p> : null}
        {error ? (
          <p className={cn("text-sm text-[var(--destructive)]")}>{error}</p>
        ) : null}
      </section>

      <AstradialDialer
        disabled={
          !status?.astradialConfigured || !status?.linked || !status?.supabaseConfigured
        }
        disabledReason={
          !status?.supabaseConfigured
            ? "Apply telephony SQL first."
            : !status?.astradialConfigured
              ? "Set ASTRADIAL_API_URL + ASTRADIAL_API_KEY on the server."
              : !status?.linked
                ? "Link your extension above."
                : null
        }
      />

      <AstradialRecentCalls />
    </div>
  );
}
