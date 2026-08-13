"use client";

import { useEffect, useState } from "react";
import type { RouteBundleSettings } from "@/lib/route-bundles/types";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Switch } from "@/components/ui/Switch";

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
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="Route Bundle settings"
      footer={
        canEdit ? (
          <Button loading={saving} disabled={saving || !form} onClick={() => void save()}>
            {saving ? "Saving…" : "Save settings"}
          </Button>
        ) : null
      }
    >
      <div className="space-y-3 px-5 py-4">
        {!form ? (
          <div className="text-sm text-[var(--so-muted)]">Loading…</div>
        ) : (
          <>
            <NumberField
              label="Max orders per bundle"
              value={form.maxOrdersPerBundle}
              disabled={!canEdit}
              onChange={(v) => setForm({ ...form, maxOrdersPerBundle: v })}
            />
            <NumberField
              label="Minimum safety buffer (min)"
              value={form.minSafetyBufferMin}
              disabled={!canEdit}
              onChange={(v) => setForm({ ...form, minSafetyBufferMin: v })}
            />
            <NumberField
              label="Max empty drive (km)"
              value={form.maxEmptyDriveKm}
              disabled={!canEdit}
              onChange={(v) => setForm({ ...form, maxEmptyDriveKm: v })}
            />
            <NumberField
              label="Service duration fallback (min)"
              value={form.serviceDurationFallbackMin}
              disabled={!canEdit}
              onChange={(v) => setForm({ ...form, serviceDurationFallbackMin: v })}
            />
            <NumberField
              label="Max Google matrix cells / generate"
              value={form.maxMatrixCellsPerGenerate}
              disabled={!canEdit}
              onChange={(v) => setForm({ ...form, maxMatrixCellsPerGenerate: v })}
            />
            <NumberField
              label="Max candidate orders"
              value={form.maxCandidateOrders}
              disabled={!canEdit}
              onChange={(v) => setForm({ ...form, maxCandidateOrders: v })}
            />
            <ToggleRow
              label="Traffic-aware routing"
              checked={form.trafficAware}
              disabled={!canEdit}
              onChange={(v) => setForm({ ...form, trafficAware: v })}
            />
            <ToggleRow
              label="Auto-generate suggestions"
              checked={form.autoGenerateSuggestions}
              disabled={!canEdit}
              onChange={(v) => setForm({ ...form, autoGenerateSuggestions: v })}
            />
            <ToggleRow
              label="Allow insertion into accepted routes"
              checked={form.allowInsertIntoAccepted}
              disabled={!canEdit}
              onChange={(v) => setForm({ ...form, allowInsertIntoAccepted: v })}
            />
            {!canEdit ? (
              <p className="text-xs text-[var(--so-muted)]">Only Admins / Settings roles can edit.</p>
            ) : null}
            {error ? <p className="text-xs text-[var(--destructive)]">{error}</p> : null}
          </>
        )}
      </div>
    </Drawer>
  );
}

function NumberField({
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
    <Field label={label}>
      <Input
        type="number"
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </Field>
  );
}

function ToggleRow({
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
    <div className="flex items-center justify-between gap-3">
      <Label className="text-sm text-[var(--so-text)]">{label}</Label>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} aria-label={label} />
    </div>
  );
}
