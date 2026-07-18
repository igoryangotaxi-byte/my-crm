"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { EMAIL_TEMPLATE_VARIABLES } from "@/lib/sales-operation/email-render";
import type { SalesEmailLocale, SalesEmailTemplate } from "@/lib/sales-operation/types";

const emptyDraft = { name: "", subject: "", body: "", locale: "en" as SalesEmailLocale };

export function SalesEmailTemplatesSettings() {
  const t = useTranslations("salesOperation.settings");
  const confirm = useConfirm();
  const [templates, setTemplates] = useState<SalesEmailTemplate[]>([]);
  const [draft, setDraft] = useState(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/sales-operation/config/email-templates", { cache: "no-store" });
      const data = (await res.json()) as { ok?: boolean; templates?: SalesEmailTemplate[] };
      if (res.ok && data.ok) setTemplates(data.templates ?? []);
    } catch {
      // ignore transient errors
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resetForm = () => {
    setDraft(emptyDraft);
    setEditingId(null);
  };

  const submit = async () => {
    if (!draft.name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const url = editingId
        ? `/api/sales-operation/config/email-templates/${editingId}`
        : "/api/sales-operation/config/email-templates";
      const res = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? t("saveError"));
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("saveError"));
    } finally {
      setBusy(false);
    }
  };

  const edit = (template: SalesEmailTemplate) => {
    setEditingId(template.id);
    setDraft({
      name: template.name,
      subject: template.subject,
      body: template.body,
      locale: template.locale,
    });
  };

  const remove = async (id: string) => {
    const ok = await confirm({
      title: t("emailTemplateDeleteConfirm"),
      confirmLabel: t("emailTemplateDelete"),
      destructive: true,
    });
    if (!ok) return;
    setError(null);
    try {
      const res = await fetch(`/api/sales-operation/config/email-templates/${id}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? t("saveError"));
      if (editingId === id) resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("saveError"));
    }
  };

  return (
    <div className="so-card p-4">
      <h2 className="crm-section-title mb-1">{t("emailTemplatesTitle")}</h2>
      <p className="mb-3 text-sm text-[var(--so-muted)]">{t("emailTemplatesSubtitle")}</p>

      {error ? <p className="mb-2 text-sm text-rose-700">{error}</p> : null}

      <div className="grid gap-2 rounded-2xl border border-[var(--so-border)] bg-[var(--so-surface-2)] p-3 md:grid-cols-2">
        <label className="block text-sm">
          <span className="crm-label">{t("emailTemplateName")}</span>
          <input
            className="crm-input mt-1 h-9 w-full px-3 text-sm"
            value={draft.name}
            onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
          />
        </label>
        <label className="block text-sm">
          <span className="crm-label">{t("emailTemplateLocale")}</span>
          <select
            className="crm-input mt-1 h-9 w-full px-3 text-sm"
            value={draft.locale}
            onChange={(event) =>
              setDraft((prev) => ({ ...prev, locale: event.target.value as SalesEmailLocale }))
            }
          >
            <option value="en">EN</option>
            <option value="he">HE</option>
          </select>
        </label>
        <label className="block text-sm md:col-span-2">
          <span className="crm-label">{t("emailTemplateSubject")}</span>
          <input
            className="crm-input mt-1 h-9 w-full px-3 text-sm"
            value={draft.subject}
            onChange={(event) => setDraft((prev) => ({ ...prev, subject: event.target.value }))}
          />
        </label>
        <label className="block text-sm md:col-span-2">
          <span className="crm-label">{t("emailTemplateBody")}</span>
          <textarea
            className="crm-input mt-1 w-full px-3 py-2 text-sm"
            rows={5}
            value={draft.body}
            onChange={(event) => setDraft((prev) => ({ ...prev, body: event.target.value }))}
          />
        </label>
        <p className="text-[0.7rem] text-muted md:col-span-2">
          {t("emailTemplateVariables")}:{" "}
          <span className="font-mono">
            {EMAIL_TEMPLATE_VARIABLES.map((variable) => `{{${variable}}}`).join(" ")}
          </span>
        </p>
        <div className="flex gap-2 md:col-span-2">
          <button
            type="button"
            disabled={busy || !draft.name.trim()}
            onClick={() => void submit()}
            className="crm-button-primary rounded-lg px-4 py-1.5 text-sm font-semibold disabled:opacity-50"
          >
            {busy ? t("saving") : editingId ? t("save") : t("emailTemplateAdd")}
          </button>
          {editingId ? (
            <button
              type="button"
              onClick={resetForm}
              className="so-focus-ring rounded-[10px] border border-[var(--so-border-strong)] bg-[var(--so-surface)] px-4 py-1.5 text-sm font-semibold text-[var(--so-text)] transition-colors hover:bg-[var(--so-surface-hover)]"
            >
              {t("emailTemplateCancelEdit")}
            </button>
          ) : null}
        </div>
      </div>

      {templates.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{t("emailTemplatesEmpty")}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {templates.map((template) => (
            <li
              key={template.id}
              className="flex items-start justify-between gap-2 rounded-xl border border-[var(--so-border)] bg-[var(--so-surface)] px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--so-text)]">
                  {template.name}
                  <span className="ml-2 text-[0.65rem] uppercase text-muted">{template.locale}</span>
                  {!template.isActive ? (
                    <span className="ml-2 text-[0.65rem] text-rose-600">
                      {t("emailTemplateInactive")}
                    </span>
                  ) : null}
                </p>
                <p className="truncate text-xs text-[var(--so-muted-2)]">{template.subject}</p>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <button
                  type="button"
                  onClick={() => edit(template)}
                  className="so-focus-ring rounded-[10px] border border-[var(--so-border-strong)] bg-[var(--so-surface)] px-2.5 py-1 text-xs font-semibold text-[var(--so-text)] transition-colors hover:bg-[var(--so-surface-hover)]"
                >
                  {t("emailTemplateEdit")}
                </button>
                <button
                  type="button"
                  onClick={() => void remove(template.id)}
                  className="rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700"
                >
                  {t("emailTemplateDelete")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
