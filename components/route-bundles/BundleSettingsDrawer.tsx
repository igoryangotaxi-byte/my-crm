"use client";

import { useEffect, useState } from "react";
import type { RouteBundleSettings } from "@/lib/route-bundles/types";

export function BundleSettingsDrawer({
  open,
  onClose,
  settings,
  canEdit,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  settings: RouteBundleSettings | null;
  canEdit: boolean;
  onSaved: (settings: RouteBundleSettings) => void;
}) {
  const [form, setForm] = useState<RouteBundleSettings | null>(settings);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setForm(settings);
  }, [settings, open]);

  if (!open) return null;

  async function save() {
    if (!form || !canEdit) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/route-bundles/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Save failed");
      onSaved(json.settings);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex justify-end bg-black/30">
      <button type="button" aria-label="Close settings" className="flex-1" onClick={onClose} />
      <div className="h-full w-full max-w-md overflow-y-auto border-l border-[var(--so-border)] bg-[var(--so-surface)] p-4 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-[var(--so-text)]">Route Bundle settings</h2>
          <button type="button" onClick={onClose} className="text-sm text-[var(--so-muted)]">
            Close
          </button>
        </div>
        {!form ? (
          <div className="text-sm text-[var(--so-muted)]">Loading…</div>
        ) : (
          <div className="space-y-3">
            <Field
              label="Max orders per bundle"
              value={form.maxOrdersPerBundle}
              disabled={!canEdit}
              onChange={(v) => setForm({ ...form, maxOrdersPerBundle: v })}
            />
            <Field
              label="Minimum safety buffer (min)"
              value={form.minSafetyBufferMin}
              disabled={!canEdit}
              onChange={(v) => setForm({ ...form, minSafetyBufferMin: v })}
            />
            <Field
              label="Max empty drive (km)"
              value={form.maxEmptyDriveKm}
              disabled={!canEdit}
              onChange={(v) => setForm({ ...form, maxEmptyDriveKm: v })}
            />
            <Field
              label="Service duration fallback (min)"
              value={form.serviceDurationFallbackMin}
              disabled={!canEdit}
              onChange={(v) => setForm({ ...form, serviceDurationFallbackMin: v })}
            />
            <Field
              label="Max Google matrix cells / generate"
              value={form.maxMatrixCellsPerGenerate}
              disabled={!canEdit}
              onChange={(v) => setForm({ ...form, maxMatrixCellsPerGenerate: v })}
            />
            <Field
              label="Max candidate orders"
              value={form.maxCandidateOrders}
              disabled={!canEdit}
              onChange={(v) => setForm({ ...form, maxCandidateOrders: v })}
            />
            <Toggle
              label="Traffic-aware routing"
              checked={form.trafficAware}
              disabled={!canEdit}
              onChange={(v) => setForm({ ...form, trafficAware: v })}
            />
            <Toggle
              label="Auto-generate suggestions"
              checked={form.autoGenerateSuggestions}
              disabled={!canEdit}
              onChange={(v) => setForm({ ...form, autoGenerateSuggestions: v })}
            />
            <Toggle
              label="Allow insertion into accepted routes"
              checked={form.allowInsertIntoAccepted}
              disabled={!canEdit}
              onChange={(v) => setForm({ ...form, allowInsertIntoAccepted: v })}
            />
            {!canEdit ? (
              <p className="text-xs text-[var(--so-muted)]">Only Admins / Settings roles can edit.</p>
            ) : null}
            {error ? <p className="text-xs text-rose-600">{error}</p> : null}
            {canEdit ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => void save()}
                className="w-full rounded-xl bg-[var(--so-accent)] py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save settings"}
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  disabled: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block text-xs font-semibold text-[var(--so-muted)]">
      {label}
      <input
        type="number"
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full rounded-lg border border-[var(--so-border)] px-2 py-1.5 text-sm text-[var(--so-text)] disabled:opacity-60"
      />
    </label>
  );
}

function Toggle({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm text-[var(--so-text)]">
      <span>{label}</span>
      <input
        type="checkbox"
        disabled={disabled}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}
