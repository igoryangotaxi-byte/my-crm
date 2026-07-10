"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/components/auth/AuthProvider";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  SalesClientManagerFields,
  type SalesClientManagerDraft,
} from "@/components/sales-operation/SalesClientManagerFields";
import { formatSalesDate, formatSalesDateTime, SALES_STATUS_COLUMNS } from "@/lib/sales-operation/display";
import { isValidStatusTransition } from "@/lib/sales-operation/status-transitions";
import type { B2BClientRegistryEntry } from "@/lib/sales-operation/manager-types";
import type { SalesClient, SalesLead, SalesLeadNote, SalesLeadStatus } from "@/lib/sales-operation/types";

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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save note.");
    } finally {
      setSavingNote(false);
    }
  };

  if (!open || !lead) return null;

  return (
    <aside className="fixed inset-y-0 right-0 z-[80] flex w-full max-w-[26rem] flex-col border-l border-white/50 bg-white/95 shadow-2xl backdrop-blur-xl">
      <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <p className="crm-label mb-1">{t("leadDetails")}</p>
          <h2 className="truncate text-lg font-semibold text-slate-900">{lead.fullName}</h2>
          <p className="text-xs text-muted">{t("statusEntered", { date: formatSalesDateTime(lead.statusEnteredAt) })}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="crm-hover-lift inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-700"
          aria-label={t("close")}
        >
          ×
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
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
    </aside>
  );
}

type PipelineBoardProps = {
  initialLeads?: SalesLead[];
};

export function SalesPipelineBoard({ initialLeads = [] }: PipelineBoardProps) {
  const t = useTranslations("salesOperation");
  const [leads, setLeads] = useState<SalesLead[]>(initialLeads);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [draggingLeadId, setDraggingLeadId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createDraft, setCreateDraft] = useState({
    fullName: "",
    email: "",
    phone: "",
    companyName: "",
    campaignName: "",
  });
  const [creating, setCreating] = useState(false);

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

  useEffect(() => {
    void loadLeads();
  }, [loadLeads]);

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

  const leadsByStatus = useMemo(() => {
    const map: Record<SalesLeadStatus, SalesLead[]> = {
      new: [],
      in_progress: [],
      proposal_sent: [],
      signed: [],
      rejected: [],
    };
    for (const lead of leads) {
      map[lead.status].push(lead);
    }
    return map;
  }, [leads]);

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
      const res = await fetch("/api/sales-operation/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createDraft),
      });
      const data = (await res.json()) as { ok?: boolean; lead?: SalesLead; error?: string };
      if (!res.ok || !data.ok || !data.lead) throw new Error(data.error ?? "Failed to create lead.");
      setLeads((prev) => [data.lead!, ...prev]);
      setShowCreate(false);
      setCreateDraft({ fullName: "", email: "", phone: "", companyName: "", campaignName: "" });
      setSelectedLeadId(data.lead.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create lead.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <section className="crm-page flex h-[calc(100dvh-10.5rem)] min-h-[24rem] flex-col">
      {error ? <p className="shrink-0 text-sm text-rose-700">{error}</p> : null}
      {loading ? <p className="shrink-0 text-sm text-muted">{t("loading")}</p> : null}

      <div className="grid min-h-0 flex-1 grid-cols-5 gap-2 lg:gap-3">
        {SALES_STATUS_COLUMNS.map((column) => (
          <div
            key={column.status}
            className="flex min-h-0 min-w-0 flex-col rounded-2xl border border-white/70 bg-white/55 p-2 backdrop-blur-md lg:rounded-3xl lg:p-3"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const leadId = event.dataTransfer.getData("text/lead-id") || draggingLeadId;
              if (leadId) void moveLeadToStatus(leadId, column.status);
              setDraggingLeadId(null);
            }}
          >
            <div className="mb-2 flex shrink-0 flex-col gap-1.5">
              <div className="flex min-w-0 items-start justify-between gap-1">
                <div className="flex min-w-0 items-center gap-1.5">
                  <StatusBadge
                    label={column.shortLabel ?? column.label}
                    tone={column.tone}
                    compact
                    title={column.label}
                  />
                  <span className="shrink-0 text-xs font-semibold text-slate-500">
                    {leadsByStatus[column.status].length}
                  </span>
                </div>
                {column.status === "new" ? (
                  <button
                    type="button"
                    onClick={() => setShowCreate(true)}
                    className="crm-button-primary shrink-0 rounded-lg px-2 py-0.5 text-[0.65rem] font-semibold lg:px-2.5 lg:py-1 lg:text-xs"
                  >
                    {t("addLead")}
                  </button>
                ) : null}
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-0.5">
              {leadsByStatus[column.status].map((lead) => (
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
                  <p className="truncate text-xs font-semibold text-slate-900 lg:text-sm">{lead.fullName}</p>
                  {lead.campaignName ? (
                    <span className="mt-1.5 inline-flex max-w-full truncate rounded-full bg-red-50 px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-red-700 lg:mt-2 lg:px-2 lg:text-[0.68rem]">
                      {lead.campaignName}
                    </span>
                  ) : (
                    <span className="mt-1.5 inline-flex rounded-full bg-slate-100 px-1.5 py-0.5 text-[0.6rem] font-medium text-slate-500 lg:mt-2 lg:px-2 lg:text-[0.68rem]">
                      {t("noCampaign")}
                    </span>
                  )}
                  <p className="mt-1.5 text-[0.65rem] text-muted lg:mt-2 lg:text-xs">
                    {formatSalesDate(lead.statusEnteredAt)}
                  </p>
                </button>
              ))}
            </div>
          </div>
        ))}
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
                  ["email", "field.email", false],
                  ["phone", "field.phone", false],
                  ["companyName", "field.company", false],
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
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                disabled={creating || !createDraft.fullName.trim()}
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
