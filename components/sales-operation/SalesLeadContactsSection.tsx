"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  SALES_CONTACT_CHANNELS,
  type CreateSalesContactInput,
  type SalesContact,
  type SalesContactChannel,
} from "@/lib/sales-operation/types";

type ContactDraft = {
  fullName: string;
  jobTitle: string;
  department: string;
  email: string;
  mobilePhone: string;
  officePhone: string;
  preferredChannel: "" | SalesContactChannel;
  isPrimary: boolean;
  isDecisionMaker: boolean;
  notes: string;
};

const emptyDraft: ContactDraft = {
  fullName: "",
  jobTitle: "",
  department: "",
  email: "",
  mobilePhone: "",
  officePhone: "",
  preferredChannel: "",
  isPrimary: false,
  isDecisionMaker: false,
  notes: "",
};

function draftFromContact(contact: SalesContact): ContactDraft {
  return {
    fullName: contact.fullName,
    jobTitle: contact.jobTitle ?? "",
    department: contact.department ?? "",
    email: contact.email ?? "",
    mobilePhone: contact.mobilePhone ?? "",
    officePhone: contact.officePhone ?? "",
    preferredChannel: contact.preferredChannel ?? "",
    isPrimary: contact.isPrimary,
    isDecisionMaker: contact.isDecisionMaker,
    notes: contact.notes ?? "",
  };
}

function draftToPayload(draft: ContactDraft): CreateSalesContactInput {
  return {
    fullName: draft.fullName.trim(),
    jobTitle: draft.jobTitle.trim() || null,
    department: draft.department.trim() || null,
    email: draft.email.trim() || null,
    mobilePhone: draft.mobilePhone.trim() || null,
    officePhone: draft.officePhone.trim() || null,
    preferredChannel: draft.preferredChannel || null,
    isPrimary: draft.isPrimary,
    isDecisionMaker: draft.isDecisionMaker,
    notes: draft.notes.trim() || null,
  };
}

export function SalesLeadContactsSection({ leadId }: { leadId: string }) {
  const t = useTranslations("salesOperation");
  const [contacts, setContacts] = useState<SalesContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ContactDraft>(emptyDraft);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/sales-operation/leads/${leadId}/contacts`, { cache: "no-store" });
      const data = (await res.json()) as { ok?: boolean; contacts?: SalesContact[]; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed to load contacts.");
      setContacts(data.contacts ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load contacts.");
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    setShowForm(false);
    setEditingId(null);
    setDraft(emptyDraft);
    void load();
  }, [load]);

  const startAdd = () => {
    setEditingId(null);
    setDraft(emptyDraft);
    setShowForm(true);
    setError(null);
  };

  const startEdit = (contact: SalesContact) => {
    setEditingId(contact.id);
    setDraft(draftFromContact(contact));
    setShowForm(true);
    setError(null);
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setDraft(emptyDraft);
  };

  const submit = async () => {
    if (!draft.fullName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const payload = draftToPayload(draft);
      const url = editingId
        ? `/api/sales-operation/leads/${leadId}/contacts/${editingId}`
        : `/api/sales-operation/leads/${leadId}/contacts`;
      const res = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed to save contact.");
      cancelForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save contact.");
    } finally {
      setSaving(false);
    }
  };

  const makePrimary = async (contact: SalesContact) => {
    if (contact.isPrimary) return;
    try {
      const res = await fetch(`/api/sales-operation/leads/${leadId}/contacts/${contact.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPrimary: true }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed to update contact.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update contact.");
    }
  };

  const remove = async (contact: SalesContact) => {
    if (!window.confirm(t("contact.deleteConfirm"))) return;
    try {
      const res = await fetch(`/api/sales-operation/leads/${leadId}/contacts/${contact.id}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed to delete contact.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete contact.");
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-white/70 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900">{t("contact.title")}</p>
        {loading ? (
          <span className="text-xs text-muted">{t("contact.loading")}</span>
        ) : (
          <button
            type="button"
            onClick={startAdd}
            className="rounded-lg border border-border px-2 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            {t("contact.add")}
          </button>
        )}
      </div>

      <div className="space-y-2">
        {contacts.length === 0 && !loading ? (
          <p className="text-xs text-muted">{t("contact.empty")}</p>
        ) : (
          contacts.map((contact) => (
            <article
              key={contact.id}
              className="rounded-xl border border-slate-200/80 bg-slate-50 px-3 py-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {contact.fullName}
                    {contact.jobTitle ? (
                      <span className="font-normal text-muted"> · {contact.jobTitle}</span>
                    ) : null}
                  </p>
                  {contact.department ? (
                    <p className="text-xs text-muted">{contact.department}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-1">
                  {contact.isPrimary ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                      {t("contact.primary")}
                    </span>
                  ) : null}
                  {contact.isDecisionMaker ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                      {t("contact.decisionMaker")}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="mt-1 space-y-0.5 text-xs">
                {contact.email ? (
                  <a
                    href={`mailto:${contact.email}`}
                    className="block truncate text-sky-700 hover:underline"
                  >
                    {contact.email}
                  </a>
                ) : null}
                {contact.mobilePhone ? (
                  <a href={`tel:${contact.mobilePhone}`} className="block text-sky-700 hover:underline">
                    {contact.mobilePhone}
                  </a>
                ) : null}
                {contact.officePhone ? (
                  <a href={`tel:${contact.officePhone}`} className="block text-sky-700 hover:underline">
                    {contact.officePhone}
                  </a>
                ) : null}
                {contact.preferredChannel ? (
                  <p className="text-muted">
                    {t("contact.preferredChannel")}: {t(`contact.channel.${contact.preferredChannel}`)}
                  </p>
                ) : null}
                {contact.notes ? (
                  <p className="whitespace-pre-wrap text-slate-700">{contact.notes}</p>
                ) : null}
              </div>

              <div className="mt-2 flex flex-wrap gap-2">
                {!contact.isPrimary ? (
                  <button
                    type="button"
                    onClick={() => void makePrimary(contact)}
                    className="text-[11px] font-semibold text-emerald-700 hover:underline"
                  >
                    {t("contact.makePrimary")}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => startEdit(contact)}
                  className="text-[11px] font-semibold text-slate-600 hover:underline"
                >
                  {t("contact.edit")}
                </button>
                <button
                  type="button"
                  onClick={() => void remove(contact)}
                  className="text-[11px] font-semibold text-rose-600 hover:underline"
                >
                  {t("contact.delete")}
                </button>
              </div>
            </article>
          ))
        )}
      </div>

      {showForm ? (
        <div className="mt-3 space-y-2 rounded-xl border border-border bg-white p-3">
          {(
            [
              ["fullName", "contact.name"],
              ["jobTitle", "contact.jobTitle"],
              ["department", "contact.department"],
              ["email", "contact.email"],
              ["mobilePhone", "contact.mobile"],
              ["officePhone", "contact.office"],
            ] as const
          ).map(([key, labelKey]) => (
            <label key={key} className="block text-sm">
              <span className="crm-label">{t(labelKey)}</span>
              <input
                className="crm-input mt-1 h-9 w-full px-3 text-sm"
                value={draft[key]}
                onChange={(event) => setDraft((prev) => ({ ...prev, [key]: event.target.value }))}
              />
            </label>
          ))}

          <label className="block text-sm">
            <span className="crm-label">{t("contact.preferredChannel")}</span>
            <select
              className="crm-input mt-1 h-9 w-full px-3 text-sm"
              value={draft.preferredChannel}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  preferredChannel: event.target.value as ContactDraft["preferredChannel"],
                }))
              }
            >
              <option value="">{t("contact.channel.none")}</option>
              {SALES_CONTACT_CHANNELS.map((channel) => (
                <option key={channel} value={channel}>
                  {t(`contact.channel.${channel}`)}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="crm-label">{t("contact.notes")}</span>
            <textarea
              className="crm-input mt-1 min-h-[64px] w-full px-3 py-2 text-sm"
              value={draft.notes}
              onChange={(event) => setDraft((prev) => ({ ...prev, notes: event.target.value }))}
            />
          </label>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={draft.isPrimary}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, isPrimary: event.target.checked }))
                }
              />
              {t("contact.primary")}
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={draft.isDecisionMaker}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, isDecisionMaker: event.target.checked }))
                }
              />
              {t("contact.decisionMaker")}
            </label>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              disabled={saving || !draft.fullName.trim()}
              onClick={() => void submit()}
              className="crm-button-primary rounded-xl px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
            >
              {saving ? t("saving") : t("contact.save")}
            </button>
            <button
              type="button"
              onClick={cancelForm}
              className="rounded-xl border border-border px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              {t("cancel")}
            </button>
          </div>
        </div>
      ) : null}

      {error ? <p className="mt-2 text-xs text-rose-700">{error}</p> : null}
    </div>
  );
}
