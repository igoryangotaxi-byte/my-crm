"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/components/auth/AuthProvider";
import { StatusBadge } from "@/components/ui/StatusBadge";
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
  open,
  onClose,
  onUpdated,
  onDeleted,
}: LeadDetailSidebarProps) {
  const t = useTranslations("salesOperation");
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
    if (!lead || !window.confirm(t("deleteLeadConfirm"))) return;
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
    if (!lead || !window.confirm(t("archiveLeadConfirm"))) return;
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

  if (!open || !lead) return null;

  return (
    <aside className="fixed inset-y-0 right-0 z-[80] flex w-full max-w-[26rem] flex-col border-l border-white/50 bg-white/95 shadow-2xl backdrop-blur-xl">
      <div className="sticky top-0 z-10 border-b border-border bg-white/95 px-5 py-4 backdrop-blur-xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="crm-label mb-1">{t("leadDetails")}</p>
            <h2 className="truncate text-lg font-semibold text-slate-900">{lead.fullName}</h2>
            {lead.companyName ? (
              <p className="truncate text-sm text-slate-600">{lead.companyName}</p>
            ) : null}
            <p className="mt-0.5 text-xs text-muted">
              {t("statusEntered", { date: formatSalesDateTime(lead.statusEnteredAt) })}
            </p>
            {lead.assignedManagerName ? (
              <span className="mt-2 inline-flex max-w-full truncate rounded-full bg-emerald-50 px-2 py-0.5 text-[0.68rem] font-semibold text-emerald-800">
                {t("manager.salesManager")}: {lead.assignedManagerName}
              </span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="crm-hover-lift inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700"
            aria-label={t("close")}
          >
            ×
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href={lead.phone ? `tel:${lead.phone}` : undefined}
            aria-disabled={!lead.phone}
            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold ${
              lead.phone
                ? "border-border text-slate-700 hover:bg-slate-50"
                : "pointer-events-none border-slate-100 text-slate-300"
            }`}
          >
            {t("quick.call")}
          </a>
          <a
            href={lead.email ? `mailto:${lead.email}` : undefined}
            aria-disabled={!lead.email}
            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold ${
              lead.email
                ? "border-border text-slate-700 hover:bg-slate-50"
                : "pointer-events-none border-slate-100 text-slate-300"
            }`}
          >
            {t("quick.email")}
          </a>
          {(() => {
            const wa = whatsappHref(lead.phone);
            return (
              <a
                href={wa ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                aria-disabled={!wa}
                className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold ${
                  wa
                    ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                    : "pointer-events-none border-slate-100 text-slate-300"
                }`}
              >
                {t("quick.whatsapp")}
              </a>
            );
          })()}
        </div>

        <div className="mt-3 flex gap-1 overflow-x-auto">
          {LEAD_DETAIL_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                activeTab === tab ? "bg-red-600 text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {t(`detailTab.${tab}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
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
            {SALES_STATUS_COLUMNS.map((column) => (
              <option key={column.status} value={column.status}>
                {column.label}
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

        {lead.status === "signed" ? (
          <div className="rounded-2xl border border-border bg-white/70 p-3">
            <p className="mb-2 text-sm font-semibold text-slate-900">{t("clientDetails")}</p>
            {loadingClient ? (
              <p className="text-xs text-muted">{t("loading")}</p>
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
                <button
                  type="button"
                  disabled={savingManagers}
                  onClick={() => void saveManagers()}
                  className="crm-button-primary mt-3 w-full rounded-xl px-3 py-2 text-sm font-semibold disabled:opacity-60"
                >
                  {savingManagers ? t("saving") : t("manager.saveClientManagers")}
                </button>
              </>
            ) : (
              <p className="text-xs text-muted">{t("client.notConvertedYet")}</p>
            )}
          </div>
        ) : null}
        </div>
        ) : null}

        {activeTab === "contacts" ? <SalesLeadContactsSection leadId={lead.id} /> : null}

        {activeTab === "tasks" ? (
          <SalesLeadTasksSection leadId={lead.id} onTasksChanged={bumpActivity} />
        ) : null}

        {activeTab === "files" ? <SalesLeadFilesSection leadId={lead.id} /> : null}

        {activeTab === "email" ? (
          <SalesLeadEmailSection
            leadId={lead.id}
            defaultTo={lead.email}
            onEmailSent={bumpActivity}
          />
        ) : null}

        {activeTab === "activity" ? (
        <div className="space-y-4">
        <div className="rounded-2xl border border-border bg-white/70 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-900">{t("notes")}</p>
            {loadingNotes ? <span className="text-xs text-muted">{t("loading")}</span> : null}
          </div>
          <div className="max-h-48 space-y-2 overflow-y-auto">
            {notes.length === 0 ? (
              <p className="text-xs text-muted">{t("noNotes")}</p>
            ) : (
              notes.map((note) => (
                <article key={note.id} className="rounded-xl border border-slate-200/80 bg-slate-50 px-3 py-2">
                  <p className="text-xs text-muted">
                    {note.authorName} · {formatSalesDateTime(note.createdAt)}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{note.body}</p>
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
          <button
            type="button"
            disabled={savingNote || !noteBody.trim()}
            onClick={() => void saveNote()}
            className="crm-button-primary mt-2 rounded-xl px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
          >
            {savingNote ? t("saving") : t("addNote")}
          </button>
        </div>

        <SalesLeadActivityFeed leadId={lead.id} refreshKey={activityRefresh} />
        </div>
        ) : null}

        {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      </div>

      <div className="space-y-2 border-t border-border px-5 py-4">
        <button
          type="button"
          disabled={saving || deleting}
          onClick={() => void saveLead()}
          className="crm-button-primary w-full rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
        >
          {saving ? t("saving") : t("saveLead")}
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={saving || deleting}
            onClick={() => void archiveLead()}
            className="w-full rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("archiveLead")}
          </button>
          <button
            type="button"
            disabled={saving || deleting || lead.status === "signed"}
            title={lead.status === "signed" ? t("deleteLeadSignedHint") : undefined}
            onClick={() => void deleteLead()}
            className="w-full rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {deleting ? t("deleting") : t("deleteLead")}
          </button>
        </div>
      </div>
    </aside>
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

export function SalesPipelineBoard({ initialLeads = [] }: PipelineBoardProps) {
  const t = useTranslations("salesOperation");
  const { users, currentUser } = useAuth();
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
        setStages(stagesData.stages.filter((stage) => stage.isActive));
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
      }
    } catch {
      // ignore malformed prefs
    }
    setPrefsLoaded(true);
  }, [prefsKey]);

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
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [leads]);

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
    const map = Object.fromEntries(stages.map((stage) => [stage.key, [] as SalesLead[]])) as Record<
      string,
      SalesLead[]
    >;
    for (const lead of filteredLeads) {
      (map[lead.status] ?? (map[lead.status] = [])).push(lead);
    }
    return map;
  }, [filteredLeads, stages]);

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
        <input
          className={`${inputClass} w-48`}
          placeholder={t("filter.search")}
          value={filters.search}
          onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
        />
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

      <div className="flex min-h-0 flex-1 gap-2 overflow-x-auto pb-1 lg:gap-3">
        {stages.map((stage) => {
          const columnLeads = leadsByStatus[stage.key] ?? [];
          const potentialSum = columnLeads.reduce(
            (sum, lead) => sum + (lead.estimatedMonthlyPotential ?? 0),
            0,
          );
          const isCollapsed = collapsed[stage.key] === true;

          if (isCollapsed) {
            return (
              <button
                key={stage.key}
                type="button"
                onClick={() => setCollapsed((prev) => ({ ...prev, [stage.key]: false }))}
                className="flex w-10 shrink-0 flex-col items-center gap-2 rounded-2xl border border-white/70 bg-white/55 py-3 backdrop-blur-md"
                title={stage.label}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const leadId = event.dataTransfer.getData("text/lead-id") || draggingLeadId;
                  if (leadId) void moveLeadToStatus(leadId, stage.key as SalesLeadStatus);
                  setDraggingLeadId(null);
                }}
              >
                <span className="text-xs font-semibold text-slate-500">{columnLeads.length}</span>
                <span className="[writing-mode:vertical-rl] rotate-180 truncate text-xs font-semibold text-slate-700">
                  {stage.label}
                </span>
              </button>
            );
          }

          return (
            <div
              key={stage.key}
              className="flex min-h-0 w-[16rem] shrink-0 flex-col rounded-2xl border border-white/70 bg-white/55 p-2 backdrop-blur-md lg:rounded-3xl lg:p-3"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const leadId = event.dataTransfer.getData("text/lead-id") || draggingLeadId;
                if (leadId) void moveLeadToStatus(leadId, stage.key as SalesLeadStatus);
                setDraggingLeadId(null);
              }}
            >
              <div className="mb-2 flex shrink-0 flex-col gap-1.5">
                <div className="flex min-w-0 items-start justify-between gap-1">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <StatusBadge label={stage.label} tone={toneForStage(stage.key)} compact title={stage.label} />
                    <span className="shrink-0 text-xs font-semibold text-slate-500">
                      {columnLeads.length}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {stage.key === "new" ? (
                      <button
                        type="button"
                        onClick={() => setShowCreate(true)}
                        className="crm-button-primary rounded-lg px-2 py-0.5 text-[0.65rem] font-semibold lg:px-2.5 lg:py-1 lg:text-xs"
                      >
                        {t("addLead")}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setCollapsed((prev) => ({ ...prev, [stage.key]: true }))}
                      className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-xs font-semibold text-slate-500"
                      title={t("column.collapse")}
                    >
                      ⟨
                    </button>
                  </div>
                </div>
                {potentialSum > 0 ? (
                  <span className="text-[0.68rem] font-semibold text-slate-500">
                    {formatIls(potentialSum)}
                  </span>
                ) : null}
              </div>

              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-0.5">
                {columnLeads.map((lead) => {
                  const title = lead.companyName?.trim() || lead.fullName;
                  const showContact = Boolean(lead.companyName?.trim());
                  const segmentName = lead.segmentId ? segmentNameById.get(lead.segmentId) : null;
                  const weighted = computeWeightedPipelineValue(lead, stageProbabilityByKey);
                  return (
                    <button
                      key={lead.id}
                      type="button"
                      draggable
                      onDragStart={(event) => {
                        setDraggingLeadId(lead.id);
                        event.dataTransfer.setData("text/lead-id", lead.id);
                        event.dataTransfer.effectAllowed = "move";
                      }}
                      onDragEnd={() => setDraggingLeadId(null)}
                      onClick={() => setSelectedLeadId(lead.id)}
                      className={`crm-hover-lift w-full rounded-xl border border-white/80 bg-white/90 p-2 text-left shadow-sm transition lg:rounded-2xl lg:p-3 ${
                        selectedLeadId === lead.id ? "ring-2 ring-red-400/70" : ""
                      }`}
                    >
                      <p className="truncate text-xs font-semibold text-slate-900 lg:text-sm">{title}</p>
                      {showContact ? (
                        <p className="truncate text-[0.65rem] text-slate-500 lg:text-xs">{lead.fullName}</p>
                      ) : null}
                      <div className="mt-1.5 flex flex-wrap gap-1 lg:mt-2">
                        {lead.estimatedMonthlyPotential ? (
                          <span className="inline-flex rounded-full bg-indigo-50 px-1.5 py-0.5 text-[0.6rem] font-semibold text-indigo-700 lg:px-2 lg:text-[0.68rem]">
                            {formatIls(lead.estimatedMonthlyPotential)}
                            {weighted > 0 ? ` · ~${formatIls(weighted)}` : ""}
                          </span>
                        ) : null}
                        {segmentName ? (
                          <span className="inline-flex max-w-full truncate rounded-full bg-sky-50 px-1.5 py-0.5 text-[0.6rem] font-semibold text-sky-700 lg:px-2 lg:text-[0.68rem]">
                            {segmentName}
                          </span>
                        ) : null}
                        {lead.campaignName ? (
                          <span className="inline-flex max-w-full truncate rounded-full bg-red-50 px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-red-700 lg:px-2 lg:text-[0.68rem]">
                            {lead.campaignName}
                          </span>
                        ) : null}
                        {lead.assignedManagerName ? (
                          <span className="inline-flex max-w-full truncate rounded-full bg-emerald-50 px-1.5 py-0.5 text-[0.6rem] font-semibold text-emerald-800 lg:px-2 lg:text-[0.68rem]">
                            {lead.assignedManagerName}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1.5 flex items-center justify-between text-[0.65rem] text-muted lg:mt-2 lg:text-xs">
                        <span>{formatSalesDate(lead.statusEnteredAt)}</span>
                        <span title={t("card.daysInStage")}>
                          {t("card.days", { count: daysInStage(lead.statusEnteredAt) })}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <SalesLeadDetailSidebar
        lead={selectedLead}
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

      {showCreate ? (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/35 px-4 backdrop-blur-sm"
          onClick={() => setShowCreate(false)}
        >
          <div
            className="crm-modal-surface w-full max-w-lg rounded-3xl p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-slate-900">{t("addLead")}</h3>
            <div className="mt-4 grid gap-3">
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
                    {segments.map((segment) => (
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
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
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
            <p className="mt-3 text-xs text-muted">{t("dedup.requiredHint")}</p>
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                disabled={
                  creating ||
                  !createDraft.fullName.trim() ||
                  (!createDraft.email.trim() && !createDraft.phone.trim())
                }
                onClick={() => void createLead()}
                className="crm-button-primary rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
              >
                {creating ? t("saving") : t("createLead")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
