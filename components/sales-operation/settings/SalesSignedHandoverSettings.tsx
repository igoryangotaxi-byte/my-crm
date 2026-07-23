"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { getAccountManagerUserOptions } from "@/lib/sales-operation/crm-manager-users";
import { DEFAULT_SIGNED_AM_EMAIL } from "@/lib/sales-operation/signed-handover";
import type { TrackerProject } from "@/lib/sales-operation/tracker-types";

type HandoverSettings = {
  defaultAccountManagerUserId: string | null;
  defaultAccountManagerName: string | null;
  trackerProjectId: string | null;
};

export function SalesSignedHandoverSettings() {
  const t = useTranslations("salesOperation.settings");
  const { users } = useAuth();
  const amOptions = useMemo(() => getAccountManagerUserOptions(users), [users]);

  const [settings, setSettings] = useState<HandoverSettings>({
    defaultAccountManagerUserId: null,
    defaultAccountManagerName: null,
    trackerProjectId: null,
  });
  const [projects, setProjects] = useState<TrackerProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const settingsRes = await fetch("/api/sales-operation/config/signed-handover", {
        cache: "no-store",
      });
      const settingsData = (await settingsRes.json()) as {
        ok?: boolean;
        settings?: HandoverSettings;
        projects?: TrackerProject[];
        error?: string;
      };
      if (!settingsRes.ok || !settingsData.ok || !settingsData.settings) {
        throw new Error(settingsData.error ?? t("loadError"));
      }
      setSettings(settingsData.settings);
      setProjects(settingsData.projects ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("loadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const am = amOptions.find((u) => u.id === settings.defaultAccountManagerUserId);
      const res = await fetch("/api/sales-operation/config/signed-handover", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          defaultAccountManagerUserId: settings.defaultAccountManagerUserId || null,
          defaultAccountManagerName: am?.name ?? settings.defaultAccountManagerName ?? null,
          trackerProjectId: settings.trackerProjectId || null,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        settings?: HandoverSettings;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.settings) throw new Error(data.error ?? t("saveError"));
      setSettings(data.settings);
      setMessage(t("saved"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("saveError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="so-card">
      <h2 className="crm-section-title mb-1">{t("handoverTitle")}</h2>
      <p className="mb-3 text-sm text-[var(--so-muted)]">{t("handoverSubtitle")}</p>
      {error ? <p className="mb-2 text-sm text-rose-600">{error}</p> : null}
      {message ? <p className="mb-2 text-sm text-emerald-600">{message}</p> : null}
      {loading ? (
        <p className="text-sm text-[var(--so-muted)]">{t("saving")}</p>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
              {t("handoverDefaultAm")}
            </label>
            <select
              className="crm-input h-9 w-full max-w-md px-3 text-sm"
              value={settings.defaultAccountManagerUserId ?? ""}
              onChange={(event) => {
                const id = event.target.value || null;
                const am = amOptions.find((u) => u.id === id);
                setSettings((prev) => ({
                  ...prev,
                  defaultAccountManagerUserId: id,
                  defaultAccountManagerName: am?.name ?? null,
                }));
              }}
            >
              <option value="">{t("handoverDefaultAmFallback", { email: DEFAULT_SIGNED_AM_EMAIL })}</option>
              {amOptions.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-[var(--so-muted)]">{t("handoverDefaultAmHint")}</p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
              {t("handoverTrackerProject")}
            </label>
            <select
              className="crm-input h-9 w-full max-w-md px-3 text-sm"
              value={settings.trackerProjectId ?? ""}
              onChange={(event) =>
                setSettings((prev) => ({
                  ...prev,
                  trackerProjectId: event.target.value || null,
                }))
              }
            >
              <option value="">{t("handoverTrackerProjectNone")}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-[var(--so-muted)]">{t("handoverTrackerProjectHint")}</p>
          </div>

          <Button loading={saving} disabled={saving} onClick={() => void save()}>
            {t("save")}
          </Button>
          <p className="text-xs text-[var(--so-muted)]">{t("handoverMigrationHint")}</p>
        </div>
      )}
    </div>
  );
}
