"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Mail, MessageSquare, Pencil, Phone, Plus, Search, X } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { Drawer, Modal } from "@/components/ui/Dialog";
import { Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/ui/cn";
import {
  SalesClientManagerFields,
  type SalesClientManagerDraft,
} from "@/components/sales-operation/SalesClientManagerFields";
import { SalesLeadContactsSection } from "@/components/sales-operation/SalesLeadContactsSection";
import { SalesLeadTasksSection } from "@/components/sales-operation/SalesLeadTasksSection";
import { SalesLeadActivityFeed } from "@/components/sales-operation/SalesLeadActivityFeed";
import { SalesLeadFilesSection } from "@/components/sales-operation/SalesLeadFilesSection";
import { SalesLeadEmailSection } from "@/components/sales-operation/SalesLeadEmailSection";
import {
  computeWeightedPipelineValue,
  defaultPipelineStages,
  formatSalesDate,
  formatSalesDateTime,
  SALES_STATUS_COLUMNS,
  type StatusTone,
} from "@/lib/sales-operation/display";
import { isValidStatusTransition } from "@/lib/sales-operation/status-transitions";
import type { DuplicateMatch } from "@/lib/sales-operation/dedup";
import type { B2BClientRegistryEntry } from "@/lib/sales-operation/manager-types";
import {
  SALES_LEAD_SOURCES,
  type PipelineStage,
  type SalesClient,
  type SalesLead,
  type SalesLeadNote,
  type SalesLeadStatus,
  type SalesSegment,
} from "@/lib/sales-operation/types";

type LeadDetailSidebarProps = {
  lead: SalesLead | null;
  stages: PipelineStage[];
  segments: SalesSegment[];
  open: boolean;
  onClose: () => void;
  onUpdated: (lead: SalesLead) => void;
  onDeleted: (leadId: string) => void;
};

const emptyDraft = {
  fullName: "",
  email: "",
  phone: "",
  companyName: "",
  campaignName: "",
  segmentId: "",
  estimatedMonthlyPotential: "",
  status: "new" as SalesLeadStatus,
};

type LeadDetailTab = "overview" | "contacts" | "activity" | "tasks" | "files" | "email";

const LEAD_DETAIL_TABS: LeadDetailTab[] = [
  "overview",
  "contacts",
  "activity",
  "tasks",
  "files",
  "email",
];

function whatsappHref(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d]/g, "");
  return digits.length >= 7 ? `https://wa.me/${digits}` : null;
}

export function SalesLeadDetailSidebar({
  lead,
  stages,
  segments,
  open,
  onClose,
  onUpdated,
  onDeleted,
}: LeadDetailSidebarProps) {
  const t = useTranslations("salesOperation");
  const confirm = useConfirm();
  const { users } = useAuth();
  const [draft, setDraft] = useState(emptyDraft);
  const [notes, setNotes] = useState<SalesLeadNote[]>([]);
  const [linkedClient, setLinkedClient] = useState<SalesClient | null>(null);
  const [registry, setRegistry] = useState<B2BClientRegistryEntry[]>([]);
  const [managerDraft, setManagerDraft] = useState<SalesClientManagerDraft>({
    corpClientId: "",
    accountManagerUserId: "",
    salesManagerUserId: "",
  });
  const [noteBody, setNoteBody] = useState("");
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [loadingClient, setLoadingClient] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingManagers, setSavingManagers] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activityRefresh, setActivityRefresh] = useState(0);
  const bumpActivity = useCallback(() => setActivityRefresh((prev) => prev + 1), []);
  const [activeTab, setActiveTab] = useState<LeadDetailTab>("overview");
  const initializedLeadIdRef = useRef<string | null>(null);
  const [smsOpen, setSmsOpen] = useState(false);
  const [smsText, setSmsText] = useState("");
  const [smsSending, setSmsSending] = useState(false);
  const [smsResult, setSmsResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [logType, setLogType] = useState<"call" | "meeting" | "whatsapp">("call");
  const [logText, setLogText] = useState("");
  const [logSaving, setLogSaving] = useState(false);
  const [logResult, setLogResult] = useState<{ ok: boolean; message: string } | null>(null);

  const loadLinkedClient = useCallback(async (leadId: string) => {
    setLoadingClient(true);
    try {
      const res = await fetch(`/api/sales-operation/leads/${leadId}/client`, { cache: "no-store" });
      const data = (await res.json()) as { ok?: boolean; client?: SalesClient; error?: string };
      if (!res.ok || !data.ok || !data.client) {
        setLinkedClient(null);
        return;
      }
      setLinkedClient(data.client);
      setManagerDraft({
        corpClientId: data.client.corpClientId ?? "",
        accountManagerUserId: data.client.accountManagerUserId ?? "",
        salesManagerUserId: data.client.salesManagerUserId ?? "",
      });
    } catch {
      setLinkedClient(null);
    } finally {
      setLoadingClient(false);
    }
  }, []);

  useEffect(() => {
    const leadId = lead?.id ?? null;
    // Background polling replaces the leads array (new object refs) with the same
    // records. Only (re)initialize the sidebar when the opened lead actually changes,
    // otherwise the active tab and in-progress edits get reset on every poll tick.
    if (leadId === initializedLeadIdRef.current) {
      return;
    }
    initializedLeadIdRef.current = leadId;
    setSmsOpen(false);
    setSmsText("");
    setSmsResult(null);
    setLogOpen(false);
    setLogType("call");
    setLogText("");
    setLogResult(null);

    if (!lead) {
      setDraft(emptyDraft);
      setNotes([]);
      setLinkedClient(null);
      return;
    }
    setDraft({
      fullName: lead.fullName,
      email: lead.email ?? "",
      phone: lead.phone ?? "",
      companyName: lead.companyName ?? "",
      campaignName: lead.campaignName ?? "",
      segmentId: lead.segmentId ?? "",
      estimatedMonthlyPotential: lead.estimatedMonthlyPotential?.toString() ?? "",
      status: lead.status,
    });
    setError(null);
    setActiveTab("overview");
    setLoadingNotes(true);
    void fetch(`/api/sales-operation/leads/${lead.id}/notes`, { cache: "no-store" })
      .then(async (res) => {
        const data = (await res.json()) as { ok?: boolean; notes?: SalesLeadNote[]; error?: string };
        if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed to load notes.");
        setNotes(data.notes ?? []);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load notes."))
      .finally(() => setLoadingNotes(false));

    if (lead.status === "signed") {
      void loadLinkedClient(lead.id);
      void fetch("/api/sales-operation/b2b-clients/registry", { cache: "no-store" })
        .then(async (res) => {
          const data = (await res.json()) as { ok?: boolean; registry?: B2BClientRegistryEntry[] };
          if (res.ok && data.ok) setRegistry(data.registry ?? []);
        })
        .catch(() => setRegistry([]));
    } else {
      setLinkedClient(null);
      setRegistry([]);
    }
  }, [lead, loadLinkedClient]);

  const saveLead = async () => {
    if (!lead) return;
    const potential = draft.estimatedMonthlyPotential.trim()
      ? Number(draft.estimatedMonthlyPotential)
      : null;
    if (potential !== null && (!Number.isFinite(potential) || potential < 0)) {
      setError(t("potential.invalid"));
      return;
    }
    if (!isValidStatusTransition(lead.status, draft.status)) {
      setError(
        lead.status === "new" && (draft.status === "signed" || draft.status === "rejected")
          ? "Move the lead to In Progress or Proposal Sent before Signed or Rejected."
          : `Cannot move a lead from ${lead.status} to ${draft.status}.`,
      );
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/sales-operation/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: draft.fullName,
          email: draft.email || null,
          phone: draft.phone || null,
          companyName: draft.companyName || null,
          campaignName: draft.campaignName || null,
          segmentId: draft.segmentId || null,
          estimatedMonthlyPotential: potential,
          status: draft.status,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; lead?: SalesLead; error?: string };
      if (!res.ok || !data.ok || !data.lead) throw new Error(data.error ?? "Failed to save lead.");
      onUpdated(data.lead);
      bumpActivity();
      if (data.lead.status === "signed") {
        void loadLinkedClient(data.lead.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save lead.");
    } finally {
      setSaving(false);
    }
  };

  const deleteLead = async () => {
    if (!lead) return;
    const ok = await confirm({
      title: t("deleteLeadConfirm"),
      confirmLabel: t("deleteLead"),
      destructive: true,
    });
    if (!ok) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/sales-operation/leads/${lead.id}`, { method: "DELETE" });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed to delete lead.");
      onDeleted(lead.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete lead.");
    } finally {
      setDeleting(false);
    }
  };

  const archiveLead = async () => {
    if (!lead) return;
    const ok = await confirm({
      title: t("archiveLeadConfirm"),
      confirmLabel: t("archiveLead"),
      destructive: true,
    });
    if (!ok) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/sales-operation/leads/${lead.id}/archive`, { method: "POST" });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed to archive lead.");
      onDeleted(lead.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to archive lead.");
    } finally {
      setDeleting(false);
    }
  };

  const saveManagers = async () => {
    if (!linkedClient) return;
    setSavingManagers(true);
    setError(null);
    try {
      const res = await fetch(`/api/sales-operation/clients/${linkedClient.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          corpClientId: managerDraft.corpClientId.trim() || null,
          accountManagerUserId: managerDraft.accountManagerUserId || null,
          salesManagerUserId: managerDraft.salesManagerUserId || null,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; client?: SalesClient; error?: string };
      if (!res.ok || !data.ok || !data.client) {
        throw new Error(data.error ?? "Failed to save client managers.");
      }
      setLinkedClient(data.client);
      setManagerDraft({
        corpClientId: data.client.corpClientId ?? "",
        accountManagerUserId: data.client.accountManagerUserId ?? "",
        salesManagerUserId: data.client.salesManagerUserId ?? "",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save client managers.");
    } finally {
      setSavingManagers(false);
    }
  };

  const saveNote = async () => {
    if (!lead || !noteBody.trim()) return;
    setSavingNote(true);
    setError(null);
    try {
      const res = await fetch(`/api/sales-operation/leads/${lead.id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: noteBody }),
      });
      const data = (await res.json()) as { ok?: boolean; note?: SalesLeadNote; error?: string };
      if (!res.ok || !data.ok || !data.note) throw new Error(data.error ?? "Failed to save note.");
      setNotes((prev) => [...prev, data.note!]);
      setNoteBody("");
      bumpActivity();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save note.");
    } finally {
      setSavingNote(false);
    }
  };

  const sendSms = async () => {
    if (!lead || !smsText.trim()) return;
    setSmsSending(true);
    setSmsResult(null);
    try {
      const res = await fetch(`/api/sales-operation/leads/${lead.id}/sms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: smsText.trim() }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; description?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed to send SMS.");
      setSmsResult({ ok: true, message: t("sms.sent") });
      setSmsText("");
      bumpActivity();
    } catch (err) {
      setSmsResult({ ok: false, message: err instanceof Error ? err.message : t("sms.failed") });
    } finally {
      setSmsSending(false);
    }
  };

  const logLeadActivity = async () => {
    if (!lead || !logText.trim()) return;
    setLogSaving(true);
    setLogResult(null);
    try {
      const res = await fetch(`/api/sales-operation/leads/${lead.id}/activity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: logType,
          title: t(`logActivity.${logType}`),
          body: logText.trim(),
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? t("logActivity.failed"));
      setLogResult({ ok: true, message: t("logActivity.saved") });
      setLogText("");
      bumpActivity();
    } catch (err) {
      setLogResult({
        ok: false,
        message: err instanceof Error ? err.message : t("logActivity.failed"),
      });
    } finally {
      setLogSaving(false);
    }
  };

  // Retain the last lead during the drawer close animation so exit transitions
  // don't crash on a null lead after selection is cleared.
  const lastLeadRef = useRef<SalesLead | null>(null);
  if (lead) lastLeadRef.current = lead;
  const d = lead ?? lastLeadRef.current;
  if (!d) return null;

  const wa = whatsappHref(d.phone);
  const quickPill =
    "so-focus-ring inline-flex items-center gap-1.5 rounded-[9px] border px-2.5 py-1.5 text-xs font-semibold transition-colors";

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={d.fullName}
      description={d.companyName || t("leadDetails")}
      width="30rem"
      footer={
        <div className="flex w-full items-center gap-2">
          <button
            type="button"
            disabled={saving || deleting}
            onClick={() => void archiveLead()}
            className="so-focus-ring flex-1 rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("archiveLead")}
          </button>
          <button
            type="button"
            disabled={saving || deleting || d.status === "signed"}
            title={d.status === "signed" ? t("deleteLeadSignedHint") : undefined}
            onClick={() => void deleteLead()}
            className="so-focus-ring flex-1 rounded-[10px] border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {deleting ? t("deleting") : t("deleteLead")}
          </button>
          <Button className="flex-1" loading={saving} disabled={saving || deleting} onClick={() => void saveLead()}>
            {t("saveLead")}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-[var(--so-muted)]">
            {t("statusEntered", { date: formatSalesDateTime(d.statusEnteredAt) })}
          </span>
          {d.assignedManagerName ? (
            <span className="inline-flex max-w-full truncate rounded-full bg-emerald-50 px-2 py-0.5 text-[0.68rem] font-semibold text-emerald-800">
              {d.assignedManagerName}
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-1.5">
          <a
            href={d.phone ? `tel:${d.phone}` : undefined}
            aria-disabled={!d.phone}
            className={cn(
              quickPill,
              d.phone
                ? "border-[var(--so-border-strong)] text-[var(--so-text)] hover:bg-[var(--so-surface-hover)]"
                : "pointer-events-none border-[var(--so-border)] text-[var(--so-muted-2)]",
            )}
          >
            <Phone className="h-3.5 w-3.5" />
            {t("quick.call")}
          </a>
          <a
            href={d.email ? `mailto:${d.email}` : undefined}
            aria-disabled={!d.email}
            className={cn(
              quickPill,
              d.email
                ? "border-[var(--so-border-strong)] text-[var(--so-text)] hover:bg-[var(--so-surface-hover)]"
                : "pointer-events-none border-[var(--so-border)] text-[var(--so-muted-2)]",
            )}
          >
            <Mail className="h-3.5 w-3.5" />
            {t("quick.email")}
          </a>
          <a
            href={wa ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={!wa}
            className={cn(
              quickPill,
              wa
                ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                : "pointer-events-none border-[var(--so-border)] text-[var(--so-muted-2)]",
            )}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            {t("quick.whatsapp")}
          </a>
          <button
            type="button"
            onClick={() => {
              setSmsResult(null);
              setSmsOpen((prev) => !prev);
            }}
            disabled={!d.phone}
            className={cn(
              quickPill,
              !d.phone
                ? "cursor-not-allowed border-[var(--so-border)] text-[var(--so-muted-2)]"
                : smsOpen
                  ? "border-[var(--so-accent)] bg-[var(--so-accent-soft)] text-[var(--so-accent-strong)]"
                  : "border-[var(--so-border-strong)] text-[var(--so-text)] hover:bg-[var(--so-surface-hover)]",
            )}
          >
            {t("quick.sms")}
          </button>
          <button
            type="button"
            onClick={() => {
              setLogResult(null);
              setLogOpen((prev) => !prev);
            }}
            className={cn(
              quickPill,
              logOpen
                ? "border-[var(--so-accent)] bg-[var(--so-accent-soft)] text-[var(--so-accent-strong)]"
                : "border-[var(--so-border-strong)] text-[var(--so-text)] hover:bg-[var(--so-surface-hover)]",
            )}
          >
            {t("quick.logActivity")}
          </button>
        </div>

        {logOpen ? (
          <div className="rounded-[12px] border border-[var(--so-border)] bg-[var(--so-surface-2)] p-3">
            <div className="mb-2 flex items-center gap-2">
              <select
                value={logType}
                onChange={(event) =>
                  setLogType(event.target.value as "call" | "meeting" | "whatsapp")
                }
                className="crm-input h-8 w-32 px-2 text-xs text-slate-700"
              >
                <option value="call">{t("logActivity.call")}</option>
                <option value="meeting">{t("logActivity.meeting")}</option>
                <option value="whatsapp">{t("logActivity.whatsapp")}</option>
              </select>
              <span className="text-[11px] text-[var(--so-muted)]">{t("logActivity.hint")}</span>
            </div>
            <textarea
              className="crm-input min-h-[56px] w-full px-3 py-2 text-sm"
              placeholder={t("logActivity.placeholder")}
              value={logText}
              maxLength={1000}
              onChange={(event) => setLogText(event.target.value)}
            />
            <div className="mt-2 flex items-center justify-end gap-2">
              {logResult ? (
                <span
                  className={`text-[11px] font-semibold ${
                    logResult.ok ? "text-emerald-700" : "text-rose-700"
                  }`}
                >
                  {logResult.message}
                </span>
              ) : null}
              <Button
                size="sm"
                loading={logSaving}
                disabled={logSaving || !logText.trim()}
                onClick={() => void logLeadActivity()}
              >
                {t("logActivity.save")}
              </Button>
            </div>
          </div>
        ) : null}

        {smsOpen && d.phone ? (
          <div className="rounded-[12px] border border-[var(--so-border)] bg-[var(--so-surface-2)] p-3">
            <p className="mb-1 text-[11px] font-semibold text-[var(--so-muted)]">
              {t("sms.to", { phone: d.phone })}
            </p>
            <textarea
              className="crm-input min-h-[64px] w-full px-3 py-2 text-sm"
              placeholder={t("sms.placeholder")}
              value={smsText}
              maxLength={480}
              onChange={(event) => setSmsText(event.target.value)}
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-[11px] text-[var(--so-muted)]">{smsText.trim().length}/480</span>
              <div className="flex items-center gap-2">
                {smsResult ? (
                  <span
                    className={`text-[11px] font-semibold ${
                      smsResult.ok ? "text-emerald-700" : "text-rose-700"
                    }`}
                  >
                    {smsResult.message}
                  </span>
                ) : null}
                <Button
                  size="sm"
                  loading={smsSending}
                  disabled={smsSending || !smsText.trim()}
                  onClick={() => void sendSms()}
                >
                  {t("sms.send")}
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          size="sm"
          className="w-full max-w-full overflow-x-auto"
          items={LEAD_DETAIL_TABS.map((tab) => ({ value: tab, label: t(`detailTab.${tab}`) }))}
        />

        {activeTab === "overview" ? (
          <div className="space-y-4">
            <label className="block text-sm">
              <span className="crm-label">{t("field.status")}</span>
              <select
                className="crm-input mt-1 h-10 w-full px-3 text-sm"
                value={draft.status}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, status: event.target.value as SalesLeadStatus }))
                }
              >
                {stages
                  .filter((stage) => stage.isActive || stage.key === d.status)
                  .map((stage) => (
                  <option key={stage.key} value={stage.key}>
                    {stage.label}
                    {!stage.isActive ? ` · ${t("settings.inactive")}` : ""}
                  </option>
                ))}
              </select>
            </label>

            {(
              [
                ["fullName", "field.fullName"],
                ["email", "field.email"],
                ["phone", "field.phone"],
                ["companyName", "field.company"],
                ["campaignName", "field.campaign"],
              ] as const
            ).map(([key, labelKey]) => (
              <label key={key} className="block text-sm">
                <span className="crm-label">{t(labelKey)}</span>
                <input
                  className="crm-input mt-1 h-10 w-full px-3 text-sm"
                  value={draft[key]}
                  onChange={(event) => setDraft((prev) => ({ ...prev, [key]: event.target.value }))}
                />
              </label>
            ))}

            <label className="block text-sm">
              <span className="crm-label">{t("field.segment")}</span>
              <select
                className="crm-input mt-1 h-10 w-full px-3 text-sm"
                value={draft.segmentId}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, segmentId: event.target.value }))
                }
              >
                <option value="">—</option>
                {segments
                  .filter((segment) => segment.isActive || segment.id === d.segmentId)
                  .map((segment) => (
                    <option key={segment.id} value={segment.id}>
                      {segment.name}
                      {!segment.isActive ? ` · ${t("settings.inactive")}` : ""}
                    </option>
                  ))}
              </select>
            </label>

            <label className="block text-sm">
              <span className="crm-label">{t("field.potential")}</span>
              <div className="relative mt-1">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm font-semibold text-[var(--so-muted)]">
                  ₪
                </span>
                <input
                  type="number"
                  min="0"
                  step="100"
                  inputMode="decimal"
                  className="crm-input h-10 w-full pl-8 pr-3 text-sm"
                  value={draft.estimatedMonthlyPotential}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      estimatedMonthlyPotential: event.target.value,
                    }))
                  }
                />
              </div>
            </label>

            {d.status === "signed" ? (
              <div className="rounded-[12px] border border-[var(--so-border)] bg-[var(--so-surface-2)] p-3">
                <p className="mb-2 text-sm font-semibold text-[var(--so-text)]">{t("clientDetails")}</p>
                {loadingClient ? (
                  <p className="text-xs text-[var(--so-muted)]">{t("loading")}</p>
                ) : linkedClient ? (
                  <>
                    <SalesClientManagerFields
                      users={users}
                      registry={registry}
                      draft={managerDraft}
                      onChange={setManagerDraft}
                      pendingSalesManagerName={linkedClient.pendingSalesManagerName}
                      assignedSalesManagerName={linkedClient.salesManagerName}
                    />
                    <Button
                      className="mt-3 w-full"
                      loading={savingManagers}
                      disabled={savingManagers}
                      onClick={() => void saveManagers()}
                    >
                      {t("manager.saveClientManagers")}
                    </Button>
                  </>
                ) : (
                  <p className="text-xs text-[var(--so-muted)]">{t("client.notConvertedYet")}</p>
                )}
              </div>
            ) : null}
          </div>
        ) : null}

        {activeTab === "contacts" ? <SalesLeadContactsSection leadId={d.id} /> : null}

        {activeTab === "tasks" ? (
          <SalesLeadTasksSection leadId={d.id} onTasksChanged={bumpActivity} />
        ) : null}

        {activeTab === "files" ? <SalesLeadFilesSection leadId={d.id} /> : null}

        {activeTab === "email" ? (
          <SalesLeadEmailSection leadId={d.id} defaultTo={d.email} onEmailSent={bumpActivity} />
        ) : null}

        {activeTab === "activity" ? (
          <div className="space-y-4">
            <div className="rounded-[12px] border border-[var(--so-border)] bg-[var(--so-surface-2)] p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-[var(--so-text)]">{t("notes")}</p>
                {loadingNotes ? (
                  <span className="text-xs text-[var(--so-muted)]">{t("loading")}</span>
                ) : null}
              </div>
              <div className="max-h-48 space-y-2 overflow-y-auto">
                {notes.length === 0 ? (
                  <p className="text-xs text-[var(--so-muted)]">{t("noNotes")}</p>
                ) : (
                  notes.map((note) => (
                    <article
                      key={note.id}
                      className="rounded-[10px] border border-[var(--so-border)] bg-[var(--so-surface)] px-3 py-2"
                    >
                      <p className="text-xs text-[var(--so-muted)]">
                        {note.authorName} · {formatSalesDateTime(note.createdAt)}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--so-text)]">
                        {note.body}
                      </p>
                    </article>
                  ))
                )}
              </div>
              <textarea
                className="crm-input mt-3 min-h-[88px] w-full px-3 py-2 text-sm"
                placeholder={t("notePlaceholder")}
                value={noteBody}
                onChange={(event) => setNoteBody(event.target.value)}
              />
              <Button
                size="sm"
                className="mt-2"
                loading={savingNote}
                disabled={savingNote || !noteBody.trim()}
                onClick={() => void saveNote()}
              >
                {t("addNote")}
              </Button>
            </div>

            <SalesLeadActivityFeed
              leadId={d.id}
              refreshKey={activityRefresh}
              stageLabels={Object.fromEntries(stages.map((stage) => [stage.key, stage.label]))}
            />
          </div>
        ) : null}

        {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      </div>
    </Drawer>
  );
}

type PipelineBoardProps = {
  initialLeads?: SalesLead[];
};

const TONE_BY_STATUS: Record<string, StatusTone> = Object.fromEntries(
  SALES_STATUS_COLUMNS.map((column) => [column.status, column.tone]),
);

function toneForStage(key: string): StatusTone {
  return TONE_BY_STATUS[key] ?? "gray";
}

function formatIls(value: number): string {
  return `₪${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value)}`;
}

function daysInStage(iso: string): number {
  const entered = new Date(iso).getTime();
  if (Number.isNaN(entered)) return 0;
  return Math.max(0, Math.floor((Date.now() - entered) / 86_400_000));
}

type PipelineFilters = {
  search: string;
  owner: string;
  segment: string;
  campaign: string;
  source: string;
  minPotential: string;
  maxPotential: string;
};

const EMPTY_FILTERS: PipelineFilters = {
  search: "",
  owner: "",
  segment: "",
  campaign: "",
  source: "",
  minPotential: "",
  maxPotential: "",
};

type SavedView = { name: string; filters: PipelineFilters };

const emptyCreateDraft = {
  fullName: "",
  email: "",
  phone: "",
  companyName: "",
  campaignName: "",
  segmentId: "",
  estimatedMonthlyPotential: "",
  assignedManagerUserId: "",
};

type LeadCardProps = {
  lead: SalesLead;
  selected: boolean;
  title: string;
  contact: string | null;
  potentialLabel: string | null;
  segmentName: string | null;
  dateLabel: string;
  daysLabel: string;
  daysTitle: string;
  onSelect: (id: string) => void;
  onDragStart: (id: string, event: React.DragEvent) => void;
  onDragEnd: () => void;
  onUpdatePotential: (id: string, value: number | null) => Promise<boolean>;
};

const LeadCard = memo(function LeadCard({
  lead,
  selected,
  title,
  contact,
  potentialLabel,
  segmentName,
  dateLabel,
  daysLabel,
  daysTitle,
  onSelect,
  onDragStart,
  onDragEnd,
  onUpdatePotential,
}: LeadCardProps) {
  const t = useTranslations("salesOperation");
  const [editingPotential, setEditingPotential] = useState(false);
  const [potentialDraft, setPotentialDraft] = useState("");
  const [savingPotential, setSavingPotential] = useState(false);

  const openPotentialEditor = () => {
    setPotentialDraft(lead.estimatedMonthlyPotential?.toString() ?? "");
    setEditingPotential(true);
  };

  const savePotential = async () => {
    const value = potentialDraft.trim() ? Number(potentialDraft) : null;
    if (value !== null && (!Number.isFinite(value) || value < 0)) return;
    setSavingPotential(true);
    const saved = await onUpdatePotential(lead.id, value);
    setSavingPotential(false);
    if (saved) setEditingPotential(false);
  };

  return (
    <div
      role="group"
      aria-label={title}
      tabIndex={0}
      draggable={!editingPotential}
      onDragStart={(event) => onDragStart(lead.id, event)}
      onDragEnd={onDragEnd}
      onClick={() => onSelect(lead.id)}
      onKeyDown={(event) => {
        if (!editingPotential && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onSelect(lead.id);
        }
      }}
      className={cn(
        "group w-full cursor-pointer rounded-[12px] border bg-[var(--so-surface)] p-3 text-left transition-[box-shadow,border-color,transform] duration-150",
        "hover:-translate-y-px hover:shadow-[var(--so-shadow-md)] active:translate-y-0",
        selected
          ? "border-[var(--so-accent)] shadow-[0_0_0_1px_var(--so-accent)]"
          : "border-[var(--so-border)] shadow-[var(--so-shadow-xs)] hover:border-[var(--so-border-strong)]",
      )}
    >
      <p className="truncate text-sm font-semibold text-[var(--so-text)]">{title}</p>
      {contact ? <p className="truncate text-xs text-[var(--so-muted)]">{contact}</p> : null}
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {editingPotential ? (
          <div
            className="flex h-8 w-full items-center gap-1 rounded-[9px] border border-[var(--so-accent)] bg-[var(--so-surface)] p-1 shadow-[0_0_0_2px_var(--so-accent-soft)]"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <span className="pl-1 text-xs font-semibold text-[var(--so-muted)]">₪</span>
            <input
              autoFocus
              type="number"
              min="0"
              step="100"
              inputMode="decimal"
              aria-label={t("field.potential")}
              value={potentialDraft}
              onChange={(event) => setPotentialDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void savePotential();
                if (event.key === "Escape") setEditingPotential(false);
              }}
              className="min-w-0 flex-1 bg-transparent px-1 text-xs font-semibold text-[var(--so-text)] outline-none"
            />
            <button
              type="button"
              disabled={savingPotential}
              aria-label={t("potential.save")}
              onClick={() => void savePotential()}
              className="so-focus-ring inline-flex h-6 w-6 items-center justify-center rounded-[6px] bg-[var(--so-accent)] text-white hover:bg-[var(--so-accent-strong)] disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              disabled={savingPotential}
              aria-label={t("cancel")}
              onClick={() => setEditingPotential(false)}
              className="so-focus-ring inline-flex h-6 w-6 items-center justify-center rounded-[6px] text-[var(--so-muted)] hover:bg-[var(--so-surface-hover)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            aria-label={potentialLabel ? t("potential.edit") : t("potential.set")}
            onKeyDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              openPotentialEditor();
            }}
            className={cn(
              "so-focus-ring inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.68rem] font-semibold transition-colors",
              potentialLabel
                ? "bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                : "border border-dashed border-[var(--so-border-strong)] text-[var(--so-muted)] hover:border-[var(--so-accent)] hover:bg-[var(--so-accent-soft)] hover:text-[var(--so-accent-strong)]",
            )}
          >
            {potentialLabel ? <Pencil className="h-2.5 w-2.5" /> : <Plus className="h-2.5 w-2.5" />}
            {potentialLabel ?? t("potential.set")}
          </button>
        )}
        {segmentName ? (
          <span className="inline-flex max-w-full truncate rounded-full bg-sky-50 px-2 py-0.5 text-[0.68rem] font-semibold text-sky-700">
            {segmentName}
          </span>
        ) : null}
        {lead.campaignName ? (
          <span className="inline-flex max-w-full truncate rounded-full bg-[var(--so-accent-soft)] px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-wide text-[var(--so-accent-strong)]">
            {lead.campaignName}
          </span>
        ) : null}
        {lead.assignedManagerName ? (
          <span className="inline-flex max-w-full truncate rounded-full bg-emerald-50 px-2 py-0.5 text-[0.68rem] font-semibold text-emerald-800">
            {lead.assignedManagerName}
          </span>
        ) : null}
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-[var(--so-muted)]">
        <span>{dateLabel}</span>
        <span title={daysTitle}>{daysLabel}</span>
      </div>
    </div>
  );
});

export function SalesPipelineBoard({ initialLeads = [] }: PipelineBoardProps) {
  const t = useTranslations("salesOperation");
  const { users, currentUser } = useAuth();
  const toast = useToast();
  const [leads, setLeads] = useState<SalesLead[]>(initialLeads);
  const [stages, setStages] = useState<PipelineStage[]>(() => defaultPipelineStages());
  const [segments, setSegments] = useState<SalesSegment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [draggingLeadId, setDraggingLeadId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createDraft, setCreateDraft] = useState(emptyCreateDraft);
  const [creating, setCreating] = useState(false);
  const [filters, setFilters] = useState<PipelineFilters>(EMPTY_FILTERS);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [createDuplicates, setCreateDuplicates] = useState<DuplicateMatch[]>([]);
  const [deepLinkApplied, setDeepLinkApplied] = useState(false);

  const prefsKey = currentUser?.id ? `sales-pipeline:v1:${currentUser.id}` : null;

  const loadLeads = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
    }
    setError(null);
    try {
      const res = await fetch("/api/sales-operation/leads", { cache: "no-store" });
      const data = (await res.json()) as { ok?: boolean; leads?: SalesLead[]; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed to load leads.");
      setLeads(data.leads ?? []);
    } catch (err) {
      if (!options?.silent) {
        setError(err instanceof Error ? err.message : "Failed to load leads.");
      }
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }, []);

  const loadConfig = useCallback(async () => {
    try {
      const [stagesRes, segmentsRes] = await Promise.all([
        fetch("/api/sales-operation/config/stages", { cache: "no-store" }),
        fetch("/api/sales-operation/config/segments", { cache: "no-store" }),
      ]);
      const stagesData = (await stagesRes.json()) as { ok?: boolean; stages?: PipelineStage[] };
      const segmentsData = (await segmentsRes.json()) as { ok?: boolean; segments?: SalesSegment[] };
      if (stagesRes.ok && stagesData.ok && stagesData.stages?.length) {
        setStages(stagesData.stages);
      }
      if (segmentsRes.ok && segmentsData.ok) setSegments(segmentsData.segments ?? []);
    } catch {
      // keep defaults
    }
  }, []);

  useEffect(() => {
    void loadLeads();
    void loadConfig();
  }, [loadLeads, loadConfig]);

  // Deep-link support: open a lead from ?lead=<id> (e.g. from global search).
  useEffect(() => {
    if (deepLinkApplied || loading) return;
    try {
      const target = new URLSearchParams(window.location.search).get("lead");
      if (target && leads.some((lead) => lead.id === target)) {
        setSelectedLeadId(target);
        setDeepLinkApplied(true);
      }
    } catch {
      // ignore malformed URL
    }
  }, [deepLinkApplied, loading, leads]);

  // Debounced duplicate pre-check while composing a new lead.
  useEffect(() => {
    if (!showCreate) {
      setCreateDuplicates([]);
      return;
    }
    const email = createDraft.email.trim();
    const phone = createDraft.phone.trim();
    const company = createDraft.companyName.trim();
    if (!email && !phone && !company) {
      setCreateDuplicates([]);
      return;
    }
    const handle = window.setTimeout(() => {
      const params = new URLSearchParams();
      if (email) params.set("email", email);
      if (phone) params.set("phone", phone);
      if (company) params.set("company", company);
      fetch(`/api/sales-operation/leads/duplicates?${params.toString()}`, { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { ok?: boolean; duplicates?: DuplicateMatch[] } | null) => {
          if (data?.ok) setCreateDuplicates(data.duplicates ?? []);
        })
        .catch(() => undefined);
    }, 400);
    return () => window.clearTimeout(handle);
  }, [showCreate, createDraft.email, createDraft.phone, createDraft.companyName]);

  useEffect(() => {
    const pollId = window.setInterval(() => {
      void loadLeads({ silent: true });
    }, 15000);
    const onFocus = () => {
      void loadLeads({ silent: true });
    };
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(pollId);
      window.removeEventListener("focus", onFocus);
    };
  }, [loadLeads]);

  // Load per-user pipeline preferences (filters, collapsed columns, saved views).
  useEffect(() => {
    if (!prefsKey) return;
    let restored = false;
    try {
      const raw = window.localStorage.getItem(prefsKey);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          filters?: Partial<PipelineFilters>;
          collapsed?: Record<string, boolean>;
          views?: SavedView[];
        };
        setFilters({ ...EMPTY_FILTERS, ...(parsed.filters ?? {}) });
        setCollapsed(parsed.collapsed ?? {});
        setSavedViews(Array.isArray(parsed.views) ? parsed.views : []);
        restored = true;
      }
    } catch {
      // ignore malformed prefs
    }
    // First-time non-admin users default to "my leads" so lead owners land on
    // their own book. Still fully switchable; admins keep the full board.
    if (!restored && currentUser?.id && currentUser.role !== "Admin") {
      setFilters({ ...EMPTY_FILTERS, owner: currentUser.id });
    }
    setPrefsLoaded(true);
  }, [prefsKey, currentUser]);

  // Persist preferences after they've been loaded (avoids clobbering on first mount).
  useEffect(() => {
    if (!prefsKey || !prefsLoaded) return;
    try {
      window.localStorage.setItem(
        prefsKey,
        JSON.stringify({ filters, collapsed, views: savedViews }),
      );
    } catch {
      // storage may be unavailable (private mode); ignore
    }
  }, [prefsKey, prefsLoaded, filters, collapsed, savedViews]);

  const segmentNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const segment of segments) map.set(segment.id, segment.name);
    return map;
  }, [segments]);

  const activeSegments = useMemo(
    () => segments.filter((segment) => segment.isActive),
    [segments],
  );

  const visibleStages = useMemo(() => {
    const occupiedStatuses = new Set(leads.map((lead) => lead.status));
    return stages.filter((stage) => stage.isActive || occupiedStatuses.has(stage.key as SalesLeadStatus));
  }, [leads, stages]);

  const stageProbabilityByKey = useMemo(() => {
    const map: Record<string, number> = {};
    for (const stage of stages) map[stage.key] = stage.probability;
    return map;
  }, [stages]);

  const campaignOptions = useMemo(() => {
    const set = new Set<string>();
    for (const lead of leads) if (lead.campaignName) set.add(lead.campaignName);
    return [...set].sort();
  }, [leads]);

  const ownerOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const lead of leads) {
      if (lead.assignedManagerUserId) {
        map.set(lead.assignedManagerUserId, lead.assignedManagerName ?? lead.assignedManagerUserId);
      }
    }
    // Ensure the current user is always selectable (so the "my leads" default and
    // self-assignment stay visible even before they own any lead).
    if (currentUser?.id && !map.has(currentUser.id)) {
      map.set(currentUser.id, currentUser.name ?? currentUser.id);
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [leads, currentUser]);

  const filtersActive = useMemo(
    () => Object.values(filters).some((value) => value.trim() !== ""),
    [filters],
  );

  const filteredLeads = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    const min = filters.minPotential ? Number(filters.minPotential) : null;
    const max = filters.maxPotential ? Number(filters.maxPotential) : null;
    return leads.filter((lead) => {
      if (search) {
        const haystack = `${lead.fullName} ${lead.companyName ?? ""} ${lead.email ?? ""} ${
          lead.phone ?? ""
        }`.toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      if (filters.owner && lead.assignedManagerUserId !== filters.owner) return false;
      if (filters.segment && lead.segmentId !== filters.segment) return false;
      if (filters.campaign && lead.campaignName !== filters.campaign) return false;
      if (filters.source && lead.source !== filters.source) return false;
      const potential = lead.estimatedMonthlyPotential ?? 0;
      if (min !== null && potential < min) return false;
      if (max !== null && potential > max) return false;
      return true;
    });
  }, [leads, filters]);

  const leadsByStatus = useMemo(() => {
    const map = Object.fromEntries(visibleStages.map((stage) => [stage.key, [] as SalesLead[]])) as Record<
      string,
      SalesLead[]
    >;
    for (const lead of filteredLeads) {
      (map[lead.status] ?? (map[lead.status] = [])).push(lead);
    }
    return map;
  }, [filteredLeads, visibleStages]);

  const selectedLead = leads.find((lead) => lead.id === selectedLeadId) ?? null;

  const moveLeadToStatus = async (leadId: string, status: SalesLeadStatus) => {
    const lead = leads.find((item) => item.id === leadId);
    if (!lead || lead.status === status) return;

    if (!isValidStatusTransition(lead.status, status)) {
      setError(
        lead.status === "new" && (status === "signed" || status === "rejected")
          ? "Move the lead to In Progress or Proposal Sent before Signed or Rejected."
          : `Cannot move a lead from ${lead.status} to ${status}.`,
      );
      return;
    }

    setLeads((prev) =>
      prev.map((item) =>
        item.id === leadId
          ? { ...item, status, statusEnteredAt: new Date().toISOString() }
          : item,
      ),
    );

    try {
      const res = await fetch(`/api/sales-operation/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = (await res.json()) as { ok?: boolean; lead?: SalesLead; error?: string };
      if (!res.ok || !data.ok || !data.lead) throw new Error(data.error ?? "Failed to update status.");
      setLeads((prev) => prev.map((item) => (item.id === leadId ? data.lead! : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status.");
      void loadLeads();
    }
  };

  const updateLeadPotential = async (leadId: string, value: number | null): Promise<boolean> => {
    const previousLead = leads.find((lead) => lead.id === leadId);
    if (!previousLead) return false;

    setLeads((prev) =>
      prev.map((lead) =>
        lead.id === leadId ? { ...lead, estimatedMonthlyPotential: value } : lead,
      ),
    );

    try {
      const res = await fetch(`/api/sales-operation/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estimatedMonthlyPotential: value }),
      });
      const data = (await res.json()) as { ok?: boolean; lead?: SalesLead; error?: string };
      if (!res.ok || !data.ok || !data.lead) {
        throw new Error(data.error ?? "Failed to update monthly potential.");
      }
      setLeads((prev) => prev.map((lead) => (lead.id === leadId ? data.lead! : lead)));
      toast.success(t("potential.saved"));
      return true;
    } catch (err) {
      setLeads((prev) => prev.map((lead) => (lead.id === leadId ? previousLead : lead)));
      toast.error(
        t("potential.saveFailed"),
        err instanceof Error ? err.message : undefined,
      );
      return false;
    }
  };

  const createLead = async () => {
    if (!createDraft.fullName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const potential = createDraft.estimatedMonthlyPotential
        ? Number(createDraft.estimatedMonthlyPotential)
        : null;
      const ownerName = users.find((user) => user.id === createDraft.assignedManagerUserId)?.name;
      const res = await fetch("/api/sales-operation/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: createDraft.fullName,
          email: createDraft.email || null,
          phone: createDraft.phone || null,
          companyName: createDraft.companyName || null,
          campaignName: createDraft.campaignName || null,
          segmentId: createDraft.segmentId || null,
          estimatedMonthlyPotential: Number.isFinite(potential) ? potential : null,
          assignedManagerUserId: createDraft.assignedManagerUserId || null,
          assignedManagerName: ownerName ?? null,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; lead?: SalesLead; error?: string };
      if (!res.ok || !data.ok || !data.lead) throw new Error(data.error ?? "Failed to create lead.");
      setLeads((prev) => [data.lead!, ...prev]);
      setShowCreate(false);
      setCreateDraft(emptyCreateDraft);
      setSelectedLeadId(data.lead.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create lead.");
    } finally {
      setCreating(false);
    }
  };

  const saveCurrentView = () => {
    const name = window.prompt(t("view.namePrompt"));
    if (!name?.trim()) return;
    setSavedViews((prev) => {
      const next = prev.filter((view) => view.name !== name.trim());
      return [...next, { name: name.trim(), filters }];
    });
  };

  const applyView = (name: string) => {
    const view = savedViews.find((item) => item.name === name);
    if (view) setFilters({ ...EMPTY_FILTERS, ...view.filters });
  };

  const inputClass = "crm-input h-8 px-2 text-xs";

  return (
    <section className="crm-page flex h-[calc(100dvh-10.5rem)] min-h-[24rem] flex-col">
      {/* Filters + saved views */}
      <div className="mb-2 flex shrink-0 flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--so-muted-2)]" />
          <input
            className={`${inputClass} w-48 pl-8`}
            placeholder={t("filter.search")}
            value={filters.search}
            onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
          />
        </div>
        <select
          className={inputClass}
          value={filters.owner}
          onChange={(event) => setFilters((prev) => ({ ...prev, owner: event.target.value }))}
        >
          <option value="">{t("filter.allOwners")}</option>
          {ownerOptions.map((owner) => (
            <option key={owner.id} value={owner.id}>
              {owner.name}
            </option>
          ))}
        </select>
        <select
          className={inputClass}
          value={filters.segment}
          onChange={(event) => setFilters((prev) => ({ ...prev, segment: event.target.value }))}
        >
          <option value="">{t("filter.allSegments")}</option>
          {segments.map((segment) => (
            <option key={segment.id} value={segment.id}>
              {segment.name}
            </option>
          ))}
        </select>
        <select
          className={inputClass}
          value={filters.campaign}
          onChange={(event) => setFilters((prev) => ({ ...prev, campaign: event.target.value }))}
        >
          <option value="">{t("filter.allCampaigns")}</option>
          {campaignOptions.map((campaign) => (
            <option key={campaign} value={campaign}>
              {campaign}
            </option>
          ))}
        </select>
        <select
          className={inputClass}
          value={filters.source}
          onChange={(event) => setFilters((prev) => ({ ...prev, source: event.target.value }))}
        >
          <option value="">{t("filter.allSources")}</option>
          {SALES_LEAD_SOURCES.map((source) => (
            <option key={source} value={source}>
              {source}
            </option>
          ))}
        </select>
        <input
          type="number"
          className={`${inputClass} w-24`}
          placeholder={t("filter.minPotential")}
          value={filters.minPotential}
          onChange={(event) => setFilters((prev) => ({ ...prev, minPotential: event.target.value }))}
        />
        <input
          type="number"
          className={`${inputClass} w-24`}
          placeholder={t("filter.maxPotential")}
          value={filters.maxPotential}
          onChange={(event) => setFilters((prev) => ({ ...prev, maxPotential: event.target.value }))}
        />
        {filtersActive ? (
          <button
            type="button"
            onClick={() => setFilters(EMPTY_FILTERS)}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600"
          >
            {t("filter.clear")}
          </button>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          {savedViews.length > 0 ? (
            <select
              className={inputClass}
              value=""
              onChange={(event) => {
                if (event.target.value) applyView(event.target.value);
              }}
            >
              <option value="">{t("view.saved")}</option>
              {savedViews.map((view) => (
                <option key={view.name} value={view.name}>
                  {view.name}
                </option>
              ))}
            </select>
          ) : null}
          <button
            type="button"
            onClick={saveCurrentView}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600"
          >
            {t("view.save")}
          </button>
        </div>
      </div>

      {error ? <p className="shrink-0 text-sm text-rose-700">{error}</p> : null}
      {loading ? <p className="shrink-0 text-sm text-muted">{t("loading")}</p> : null}

      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-1">
        {visibleStages.map((stage) => {
          const columnLeads = leadsByStatus[stage.key] ?? [];
          const potentialSum = columnLeads.reduce(
            (sum, lead) => sum + (lead.estimatedMonthlyPotential ?? 0),
            0,
          );
          const isCollapsed = collapsed[stage.key] === true;
          const isDropTarget = Boolean(draggingLeadId);

          if (isCollapsed) {
            return (
              <button
                key={stage.key}
                type="button"
                onClick={() => setCollapsed((prev) => ({ ...prev, [stage.key]: false }))}
                className="flex w-11 shrink-0 flex-col items-center gap-2 rounded-[14px] border border-[var(--so-border)] bg-[var(--so-surface-2)] py-3 transition-colors hover:bg-[var(--so-surface-hover)]"
                title={stage.label}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const leadId = event.dataTransfer.getData("text/lead-id") || draggingLeadId;
                  if (leadId) void moveLeadToStatus(leadId, stage.key as SalesLeadStatus);
                  setDraggingLeadId(null);
                }}
              >
                <span className="text-xs font-bold text-[var(--so-muted)]">{columnLeads.length}</span>
                <span className="[writing-mode:vertical-rl] rotate-180 truncate text-xs font-semibold text-[var(--so-text)]">
                  {stage.label}
                </span>
              </button>
            );
          }

          return (
            <div
              key={stage.key}
              className={cn(
                "flex min-h-0 w-[17rem] shrink-0 flex-col rounded-[16px] border bg-[var(--so-surface-2)] p-2.5 transition-colors",
                isDropTarget
                  ? "border-dashed border-[var(--so-accent)]/40"
                  : "border-[var(--so-border)]",
              )}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const leadId = event.dataTransfer.getData("text/lead-id") || draggingLeadId;
                if (leadId) void moveLeadToStatus(leadId, stage.key as SalesLeadStatus);
                setDraggingLeadId(null);
              }}
            >
              <div className="mb-2.5 flex shrink-0 flex-col gap-1.5">
                <div className="flex min-w-0 items-center justify-between gap-1">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <StatusBadge label={stage.label} tone={toneForStage(stage.key)} compact title={stage.label} />
                    <span className="shrink-0 rounded-full bg-[var(--so-surface)] px-1.5 text-xs font-bold text-[var(--so-muted)]">
                      {columnLeads.length}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {stage.key === "new" ? (
                      <button
                        type="button"
                        onClick={() => setShowCreate(true)}
                        title={t("addLead")}
                        className="so-focus-ring inline-flex h-7 w-7 items-center justify-center rounded-[8px] bg-[var(--so-accent)] text-white transition-colors hover:bg-[var(--so-accent-strong)]"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setCollapsed((prev) => ({ ...prev, [stage.key]: true }))}
                      className="so-focus-ring inline-flex h-7 w-7 items-center justify-center rounded-[8px] border border-[var(--so-border-strong)] bg-[var(--so-surface)] text-xs font-semibold text-[var(--so-muted)] transition-colors hover:bg-[var(--so-surface-hover)]"
                      title={t("column.collapse")}
                    >
                      ⟨
                    </button>
                  </div>
                </div>
                {potentialSum > 0 ? (
                  <span className="text-[0.68rem] font-semibold text-[var(--so-muted)]">
                    {formatIls(potentialSum)}
                  </span>
                ) : null}
              </div>

              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-0.5">
                {columnLeads.length === 0 ? (
                  <div className="rounded-[12px] border border-dashed border-[var(--so-border-strong)] py-6 text-center text-xs text-[var(--so-muted-2)]">
                    {t("column.empty")}
                  </div>
                ) : (
                  columnLeads.map((lead) => {
                    const cardTitle = lead.companyName?.trim() || lead.fullName;
                    const showContact = Boolean(lead.companyName?.trim());
                    const segmentName = lead.segmentId ? segmentNameById.get(lead.segmentId) ?? null : null;
                    const weighted = computeWeightedPipelineValue(lead, stageProbabilityByKey);
                    const potentialLabel =
                      lead.estimatedMonthlyPotential !== null
                        ? `${formatIls(lead.estimatedMonthlyPotential)}${weighted > 0 ? ` · ~${formatIls(weighted)}` : ""}`
                        : null;
                    return (
                      <LeadCard
                        key={lead.id}
                        lead={lead}
                        selected={selectedLeadId === lead.id}
                        title={cardTitle}
                        contact={showContact ? lead.fullName : null}
                        potentialLabel={potentialLabel}
                        segmentName={segmentName}
                        dateLabel={formatSalesDate(lead.statusEnteredAt)}
                        daysLabel={t("card.days", { count: daysInStage(lead.statusEnteredAt) })}
                        daysTitle={t("card.daysInStage")}
                        onSelect={setSelectedLeadId}
                        onDragStart={(id, event) => {
                          setDraggingLeadId(id);
                          event.dataTransfer.setData("text/lead-id", id);
                          event.dataTransfer.effectAllowed = "move";
                        }}
                        onDragEnd={() => setDraggingLeadId(null)}
                        onUpdatePotential={updateLeadPotential}
                      />
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      <SalesLeadDetailSidebar
        lead={selectedLead}
        stages={stages}
        segments={segments}
        open={Boolean(selectedLead)}
        onClose={() => setSelectedLeadId(null)}
        onUpdated={(lead) => {
          setLeads((prev) => prev.map((item) => (item.id === lead.id ? lead : item)));
        }}
        onDeleted={(leadId) => {
          setLeads((prev) => prev.filter((item) => item.id !== leadId));
          setSelectedLeadId(null);
        }}
      />

      <Modal
        open={showCreate}
        onOpenChange={setShowCreate}
        title={t("addLead")}
        className="max-w-lg"
        footer={
          <>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="so-focus-ring rounded-[10px] border border-[var(--so-border-strong)] bg-[var(--so-surface)] px-4 py-2 text-sm font-semibold text-[var(--so-text)] transition-colors hover:bg-[var(--so-surface-hover)]"
            >
              {t("cancel")}
            </button>
            <Button
              loading={creating}
              disabled={
                creating ||
                !createDraft.fullName.trim() ||
                (!createDraft.email.trim() && !createDraft.phone.trim())
              }
              onClick={() => void createLead()}
            >
              {t("createLead")}
            </Button>
          </>
        }
      >
        <div className="grid gap-3">
          {(
                [
                  ["fullName", "field.fullName", true],
                  ["companyName", "field.company", false],
                  ["email", "field.email", false],
                  ["phone", "field.phone", false],
                  ["campaignName", "field.campaign", false],
                ] as const
              ).map(([key, labelKey, required]) => (
                <label key={key} className="block text-sm">
                  <span className="crm-label">{t(labelKey)}</span>
                  <input
                    required={required}
                    className="crm-input mt-1 h-10 w-full px-3 text-sm"
                    value={createDraft[key]}
                    onChange={(event) =>
                      setCreateDraft((prev) => ({ ...prev, [key]: event.target.value }))
                    }
                  />
                </label>
              ))}
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="crm-label">{t("field.segment")}</span>
                  <select
                    className="crm-input mt-1 h-10 w-full px-3 text-sm"
                    value={createDraft.segmentId}
                    onChange={(event) =>
                      setCreateDraft((prev) => ({ ...prev, segmentId: event.target.value }))
                    }
                  >
                    <option value="">—</option>
                    {activeSegments.map((segment) => (
                      <option key={segment.id} value={segment.id}>
                        {segment.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="crm-label">{t("field.potential")}</span>
                  <input
                    type="number"
                    className="crm-input mt-1 h-10 w-full px-3 text-sm"
                    value={createDraft.estimatedMonthlyPotential}
                    onChange={(event) =>
                      setCreateDraft((prev) => ({
                        ...prev,
                        estimatedMonthlyPotential: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
              <label className="block text-sm">
                <span className="crm-label">{t("field.owner")}</span>
                <select
                  className="crm-input mt-1 h-10 w-full px-3 text-sm"
                  value={createDraft.assignedManagerUserId}
                  onChange={(event) =>
                    setCreateDraft((prev) => ({ ...prev, assignedManagerUserId: event.target.value }))
                  }
                >
                  <option value="">{t("manager.unassigned")}</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
            </select>
          </label>
        </div>
        {createDuplicates.length > 0 ? (
          <div className="mt-4 rounded-[12px] border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-semibold text-amber-800">
              {t("dedup.warning", { count: createDuplicates.length })}
            </p>
            <ul className="mt-1.5 space-y-1">
              {createDuplicates.slice(0, 4).map((dup) => (
                <li key={dup.leadId}>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreate(false);
                      setSelectedLeadId(dup.leadId);
                    }}
                    className="w-full truncate rounded-lg px-2 py-1 text-left text-xs text-amber-900 transition hover:bg-amber-100"
                  >
                    {dup.companyName || dup.fullName}
                    <span className="ml-1 text-amber-600">
                      · {dup.matchedOn.map((field) => t(`dedup.field.${field}`)).join(", ")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <p className="mt-3 text-xs text-[var(--so-muted)]">{t("dedup.requiredHint")}</p>
      </Modal>
    </section>
  );
}
