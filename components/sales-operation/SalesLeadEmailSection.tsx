"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { formatSalesDateTime } from "@/lib/sales-operation/display";
import type { SalesEmailMessage, SalesEmailTemplate } from "@/lib/sales-operation/types";

type Props = {
  leadId: string;
  defaultTo?: string | null;
  onEmailSent?: () => void;
};

const STATUS_TONE: Record<string, string> = {
  sent: "bg-emerald-50 text-emerald-700 border-emerald-200",
  received: "bg-sky-50 text-sky-700 border-sky-200",
  failed: "bg-rose-50 text-rose-700 border-rose-200",
  logged: "bg-amber-50 text-amber-700 border-amber-200",
};

export function SalesLeadEmailSection({ leadId, defaultTo, onEmailSent }: Props) {
  const t = useTranslations("salesOperation");
  const [messages, setMessages] = useState<SalesEmailMessage[]>([]);
  const [templates, setTemplates] = useState<SalesEmailTemplate[]>([]);
  const [sendingConfigured, setSendingConfigured] = useState(true);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [to, setTo] = useState(defaultTo ?? "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [templateId, setTemplateId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [emailsRes, templatesRes] = await Promise.all([
        fetch(`/api/sales-operation/leads/${leadId}/email`, { cache: "no-store" }),
        fetch("/api/sales-operation/config/email-templates?activeOnly=1", { cache: "no-store" }),
      ]);
      const emailsData = (await emailsRes.json()) as {
        ok?: boolean;
        messages?: SalesEmailMessage[];
        sendingConfigured?: boolean;
        error?: string;
      };
      if (!emailsRes.ok || !emailsData.ok) throw new Error(emailsData.error ?? "Failed to load.");
      setMessages(emailsData.messages ?? []);
      setSendingConfigured(emailsData.sendingConfigured !== false);
      const templatesData = (await templatesRes.json()) as {
        ok?: boolean;
        templates?: SalesEmailTemplate[];
      };
      if (templatesRes.ok && templatesData.ok) setTemplates(templatesData.templates ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load emails.");
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === templateId) ?? null,
    [templates, templateId],
  );

  const applyTemplate = (id: string) => {
    setTemplateId(id);
    const template = templates.find((item) => item.id === id);
    if (template) {
      setSubject(template.subject);
      setBody(template.body);
    }
  };

  const send = async () => {
    if (!to.trim() || !subject.trim()) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/sales-operation/leads/${leadId}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: to.trim(),
          subject: subject.trim(),
          body,
          templateId: templateId || undefined,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed to send email.");
      setSubject("");
      setBody("");
      setTemplateId("");
      await load();
      onEmailSent?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send email.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="so-card space-y-3 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-[var(--so-text)]">{t("email.title")}</p>
        {loading ? <span className="text-xs text-muted">{t("loading")}</span> : null}
      </div>

      {!sendingConfigured ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {t("email.notConfigured")}
        </p>
      ) : null}

      <div className="space-y-2 rounded-xl border border-[var(--so-border)] bg-[var(--so-surface)] p-3">
        {templates.length > 0 ? (
          <label className="block text-sm">
            <span className="crm-label">{t("email.template")}</span>
            <select
              className="crm-input mt-1 h-10 w-full px-3 text-sm"
              value={templateId}
              onChange={(event) => applyTemplate(event.target.value)}
            >
              <option value="">{t("email.noTemplate")}</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="block text-sm">
          <span className="crm-label">{t("email.to")}</span>
          <input
            type="email"
            className="crm-input mt-1 h-10 w-full px-3 text-sm"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            placeholder="name@example.com"
          />
        </label>
        <label className="block text-sm">
          <span className="crm-label">{t("email.subject")}</span>
          <input
            className="crm-input mt-1 h-10 w-full px-3 text-sm"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="crm-label">{t("email.body")}</span>
          <textarea
            className="crm-input mt-1 w-full px-3 py-2 text-sm"
            rows={5}
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
        </label>
        {selectedTemplate ? (
          <p className="text-[0.7rem] text-muted">{t("email.variablesHint")}</p>
        ) : null}
        <div className="flex justify-end">
          <button
            type="button"
            disabled={sending || !to.trim() || !subject.trim()}
            onClick={() => void send()}
            className="crm-button-primary rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {sending ? t("saving") : sendingConfigured ? t("email.send") : t("email.saveDraft")}
          </button>
        </div>
      </div>

      {error ? <p className="text-xs text-rose-700">{error}</p> : null}

      {messages.length === 0 && !loading ? (
        <p className="text-xs text-muted">{t("email.empty")}</p>
      ) : (
        <ol className="max-h-72 space-y-2 overflow-y-auto">
          {messages.map((message) => (
            <li
              key={message.id}
              className="rounded-xl border border-[var(--so-border)] bg-[var(--so-surface)] p-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-[var(--so-text)]">
                    {message.subject || "(no subject)"}
                  </p>
                  <p className="truncate text-[0.7rem] text-muted">
                    {message.direction === "inbound"
                      ? t("email.fromLabel", { address: message.fromAddress ?? "" })
                      : t("email.toLabel", { address: message.toAddress ?? "" })}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[0.6rem] font-semibold ${
                    STATUS_TONE[message.status] ??
                    "border-[var(--so-border)] bg-[var(--so-surface-2)] text-[var(--so-muted)]"
                  }`}
                >
                  {t(`email.status.${message.status}`)}
                </span>
              </div>
              {message.body ? (
                <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-[0.72rem] text-[var(--so-muted)]">
                  {message.body}
                </p>
              ) : null}
              <p className="mt-1 text-[0.65rem] text-muted">
                {message.actorName ?? "System"} · {formatSalesDateTime(message.occurredAt)}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
