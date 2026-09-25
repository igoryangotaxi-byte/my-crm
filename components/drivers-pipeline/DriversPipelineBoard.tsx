"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Drawer, Modal } from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Toast";
import { ClickToCallButton } from "@/components/call-center/DriverCallButton";
import { cn } from "@/lib/ui/cn";
import {
  DRIVER_STATUS_COLUMNS,
  formatDriverDateTime,
  type StatusTone,
} from "@/lib/drivers-pipeline/display";
import type {
  DriverLead,
  DriverLeadNote,
  DriverLeadStatus,
} from "@/lib/drivers-pipeline/types";

const toneClass: Record<StatusTone, string> = {
  gray: "bg-zinc-100 text-zinc-700",
  blue: "bg-sky-100 text-sky-800",
  green: "bg-emerald-100 text-emerald-800",
  red: "bg-rose-100 text-rose-800",
  yellow: "bg-amber-100 text-amber-900",
};

export function DriversPipelineBoard() {
  const toast = useToast();
  const searchParams = useSearchParams();
  const [leads, setLeads] = useState<DriverLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notes, setNotes] = useState<DriverLeadNote[]>([]);
  const [noteDraft, setNoteDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState({
    fullName: "",
    email: "",
    phone: "",
  });
  const [dragOverStatus, setDragOverStatus] = useState<DriverLeadStatus | null>(null);
  const [rejectPrompt, setRejectPrompt] = useState<{
    leadId: string;
    substatus: string;
  } | null>(null);

  const selected = useMemo(
    () => leads.find((l) => l.id === selectedId) ?? null,
    [leads, selectedId],
  );

  const loadLeads = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sales-operation/drivers-leads", { cache: "no-store" });
      const json = (await res.json()) as { ok?: boolean; leads?: DriverLead[]; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Failed to load leads.");
      setLeads(json.leads ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load leads.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadLeads();
  }, [loadLeads]);

  useEffect(() => {
    const leadParam = searchParams.get("lead");
    if (leadParam) setSelectedId(leadParam);
  }, [searchParams]);

  useEffect(() => {
    if (!selectedId) {
      setNotes([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/sales-operation/drivers-leads/${selectedId}/notes`, {
          cache: "no-store",
        });
        const json = (await res.json()) as {
          ok?: boolean;
          notes?: DriverLeadNote[];
        };
        if (!cancelled && res.ok && json.ok) setNotes(json.notes ?? []);
      } catch {
        if (!cancelled) setNotes([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter((lead) => {
      const hay = [
        lead.fullName,
        lead.email,
        lead.phone,
        lead.rejectedSubstatus,
        lead.assignedManagerName,
        lead.campaignName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [leads, query]);

  const byStatus = useMemo(() => {
    const map = Object.fromEntries(
      DRIVER_STATUS_COLUMNS.map((c) => [c.status, [] as DriverLead[]]),
    ) as Record<DriverLeadStatus, DriverLead[]>;
    for (const lead of filtered) {
      map[lead.status]?.push(lead);
    }
    return map;
  }, [filtered]);

  async function transitionLead(
    leadId: string,
    toStatus: DriverLeadStatus,
    rejectedSubstatus?: string | null,
  ) {
    setSaving(true);
    try {
      const res = await fetch(`/api/sales-operation/drivers-leads/${leadId}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toStatus, rejectedSubstatus }),
      });
      const json = (await res.json()) as { ok?: boolean; lead?: DriverLead; error?: string };
      if (!res.ok || !json.ok || !json.lead) throw new Error(json.error ?? "Transition failed.");
      setLeads((prev) => prev.map((l) => (l.id === json.lead!.id ? json.lead! : l)));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Transition failed.");
    } finally {
      setSaving(false);
    }
  }

  async function onDropStatus(toStatus: DriverLeadStatus, leadId: string) {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead || lead.status === toStatus) return;
    if (toStatus === "rejected") {
      setRejectPrompt({ leadId, substatus: lead.rejectedSubstatus ?? "" });
      return;
    }
    await transitionLead(leadId, toStatus, null);
  }

  async function saveSelected(patch: Partial<DriverLead>) {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/sales-operation/drivers-leads/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: patch.fullName ?? selected.fullName,
          email: patch.email !== undefined ? patch.email : selected.email,
          phone: patch.phone !== undefined ? patch.phone : selected.phone,
          generalNotes:
            patch.generalNotes !== undefined ? patch.generalNotes : selected.generalNotes,
          rejectedSubstatus:
            patch.rejectedSubstatus !== undefined
              ? patch.rejectedSubstatus
              : selected.rejectedSubstatus,
          assignedManagerName:
            patch.assignedManagerName !== undefined
              ? patch.assignedManagerName
              : selected.assignedManagerName,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; lead?: DriverLead; error?: string };
      if (!res.ok || !json.ok || !json.lead) throw new Error(json.error ?? "Save failed.");
      setLeads((prev) => prev.map((l) => (l.id === json.lead!.id ? json.lead! : l)));
      toast.success("Lead saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function addNote() {
    if (!selected || !noteDraft.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/sales-operation/drivers-leads/${selected.id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: noteDraft }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        note?: DriverLeadNote;
        error?: string;
      };
      if (!res.ok || !json.ok || !json.note) throw new Error(json.error ?? "Failed to add note.");
      setNotes((prev) => [json.note!, ...prev]);
      setNoteDraft("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add note.");
    } finally {
      setSaving(false);
    }
  }

  async function createLead() {
    if (!createDraft.fullName.trim()) {
      toast.error("Name is required.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/sales-operation/drivers-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: createDraft.fullName,
          email: createDraft.email || null,
          phone: createDraft.phone || null,
          status: "new",
          source: "manual",
        }),
      });
      const json = (await res.json()) as { ok?: boolean; lead?: DriverLead; error?: string };
      if (!res.ok || !json.ok || !json.lead) throw new Error(json.error ?? "Create failed.");
      setLeads((prev) => [json.lead!, ...prev]);
      setCreateOpen(false);
      setCreateDraft({ fullName: "", email: "", phone: "" });
      setSelectedId(json.lead.id);
      toast.success("Lead created.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Create failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-[var(--so-text)]">Drivers Pipeline</h1>
          <p className="text-sm text-[var(--so-muted)]">
            New → In Progress → Registered / Rejected
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-[var(--so-muted)]" />
            <input
              className="crm-input h-9 w-56 pl-8 text-sm"
              placeholder="Search name, phone…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Add lead
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center text-[var(--so-muted)]">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading…
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 gap-3 overflow-x-auto pb-2 md:grid-cols-4">
          {DRIVER_STATUS_COLUMNS.map((column) => (
            <section
              key={column.status}
              className={cn(
                "flex min-h-[420px] min-w-[240px] flex-col rounded-xl border border-[var(--so-border)] bg-[var(--so-surface)]",
                dragOverStatus === column.status && "ring-2 ring-[var(--accent)]",
              )}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverStatus(column.status);
              }}
              onDragLeave={() => setDragOverStatus((s) => (s === column.status ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverStatus(null);
                const leadId = e.dataTransfer.getData("text/driver-lead-id");
                if (leadId) void onDropStatus(column.status, leadId);
              }}
            >
              <header className="flex items-center justify-between gap-2 border-b border-[var(--so-border)] px-3 py-2.5">
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-medium",
                    toneClass[column.tone],
                  )}
                >
                  {column.label}
                </span>
                <span className="text-xs text-[var(--so-muted)]">
                  {byStatus[column.status]?.length ?? 0}
                </span>
              </header>
              <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2">
                {(byStatus[column.status] ?? []).map((lead) => (
                  <article
                    key={lead.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/driver-lead-id", lead.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onClick={() => setSelectedId(lead.id)}
                    className={cn(
                      "so-kanban-card cursor-pointer rounded-lg border border-[var(--so-border)] bg-white p-3 shadow-sm transition hover:border-[var(--so-border-strong)]",
                      selectedId === lead.id && "ring-2 ring-[var(--accent)]",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-[var(--so-text)]">
                          {lead.fullName}
                        </p>
                        <p className="truncate text-xs text-[var(--so-muted)]">
                          {lead.phone || lead.email || "—"}
                        </p>
                      </div>
                      {lead.phone ? (
                        <ClickToCallButton
                          phone={lead.phone}
                          variant="pill"
                          label="Dial"
                          entityType="driver"
                          entityId={lead.id}
                          compact
                        />
                      ) : null}
                    </div>
                    {lead.status === "rejected" && lead.rejectedSubstatus ? (
                      <p className="mt-2 truncate text-[11px] text-rose-700">
                        {lead.rejectedSubstatus}
                      </p>
                    ) : null}
                    {lead.assignedManagerName ? (
                      <p className="mt-1 truncate text-[11px] text-[var(--so-muted)]">
                        {lead.assignedManagerName}
                      </p>
                    ) : null}
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <Drawer
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
        title={selected?.fullName ?? "Lead"}
      >
        {selected ? (
          <div className="space-y-4 px-5 py-4">
            <div className="flex flex-wrap gap-2">
              <ClickToCallButton
                phone={selected.phone}
                variant="dial"
                label="Dial"
                entityType="driver"
                entityId={selected.id}
                emptyReason="No phone on this lead"
                stopPropagation={false}
              />
            </div>

            <label className="block space-y-1 text-sm">
              <span className="crm-label">Full name</span>
              <input
                className="crm-input w-full"
                defaultValue={selected.fullName}
                key={`name-${selected.id}-${selected.updatedAt}`}
                onBlur={(e) => {
                  if (e.target.value.trim() !== selected.fullName) {
                    void saveSelected({ fullName: e.target.value });
                  }
                }}
              />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="crm-label">Phone</span>
              <input
                className="crm-input w-full"
                defaultValue={selected.phone ?? ""}
                key={`phone-${selected.id}-${selected.updatedAt}`}
                onBlur={(e) => {
                  const next = e.target.value.trim() || null;
                  if (next !== selected.phone) void saveSelected({ phone: next });
                }}
              />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="crm-label">Email</span>
              <input
                className="crm-input w-full"
                defaultValue={selected.email ?? ""}
                key={`email-${selected.id}-${selected.updatedAt}`}
                onBlur={(e) => {
                  const next = e.target.value.trim() || null;
                  if (next !== selected.email) void saveSelected({ email: next });
                }}
              />
            </label>
            {selected.status === "rejected" ? (
              <label className="block space-y-1 text-sm">
                <span className="crm-label">Rejected substatus</span>
                <input
                  className="crm-input w-full"
                  defaultValue={selected.rejectedSubstatus ?? ""}
                  key={`sub-${selected.id}-${selected.updatedAt}`}
                  onBlur={(e) => {
                    const next = e.target.value.trim() || null;
                    if (next !== selected.rejectedSubstatus) {
                      void saveSelected({ rejectedSubstatus: next });
                    }
                  }}
                />
              </label>
            ) : null}
            <label className="block space-y-1 text-sm">
              <span className="crm-label">Hub expert / assignee</span>
              <input
                className="crm-input w-full"
                defaultValue={selected.assignedManagerName ?? ""}
                key={`assignee-${selected.id}-${selected.updatedAt}`}
                onBlur={(e) => {
                  const next = e.target.value.trim() || null;
                  if (next !== selected.assignedManagerName) {
                    void saveSelected({ assignedManagerName: next });
                  }
                }}
              />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="crm-label">Notes</span>
              <textarea
                className="crm-input min-h-24 w-full"
                defaultValue={selected.generalNotes ?? ""}
                key={`notes-${selected.id}-${selected.updatedAt}`}
                onBlur={(e) => {
                  const next = e.target.value.trim() || null;
                  if (next !== selected.generalNotes) {
                    void saveSelected({ generalNotes: next });
                  }
                }}
              />
            </label>

            <div className="space-y-2">
              <p className="text-xs text-[var(--so-muted)]">
                Status entered {formatDriverDateTime(selected.statusEnteredAt)} · source{" "}
                {selected.source}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {DRIVER_STATUS_COLUMNS.map((column) => (
                  <button
                    key={column.status}
                    type="button"
                    disabled={saving || selected.status === column.status}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-xs font-medium disabled:opacity-50",
                      toneClass[column.tone],
                      selected.status === column.status && "ring-2 ring-[var(--accent)]",
                    )}
                    onClick={() => {
                      if (column.status === "rejected") {
                        setRejectPrompt({
                          leadId: selected.id,
                          substatus: selected.rejectedSubstatus ?? "",
                        });
                        return;
                      }
                      void transitionLead(selected.id, column.status, null);
                    }}
                  >
                    {column.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2 border-t border-[var(--so-border)] pt-3">
              <p className="text-sm font-medium">Activity notes</p>
              <div className="flex gap-2">
                <input
                  className="crm-input flex-1"
                  placeholder="Add a note…"
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void addNote();
                  }}
                />
                <Button loading={saving} disabled={!noteDraft.trim()} onClick={() => void addNote()}>
                  Add
                </Button>
              </div>
              <ul className="space-y-2">
                {notes.map((note) => (
                  <li
                    key={note.id}
                    className="rounded-lg border border-[var(--so-border)] bg-[var(--so-surface)] px-3 py-2 text-sm"
                  >
                    <p>{note.body}</p>
                    <p className="mt-1 text-[11px] text-[var(--so-muted)]">
                      {note.authorName} · {formatDriverDateTime(note.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}
      </Drawer>

      <Modal
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Add driver lead"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button loading={saving} onClick={() => void createLead()}>
              Create
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <label className="block space-y-1 text-sm">
            <span className="crm-label">Full name</span>
            <input
              className="crm-input w-full"
              value={createDraft.fullName}
              onChange={(e) => setCreateDraft((d) => ({ ...d, fullName: e.target.value }))}
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="crm-label">Phone</span>
            <input
              className="crm-input w-full"
              value={createDraft.phone}
              onChange={(e) => setCreateDraft((d) => ({ ...d, phone: e.target.value }))}
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="crm-label">Email</span>
            <input
              className="crm-input w-full"
              value={createDraft.email}
              onChange={(e) => setCreateDraft((d) => ({ ...d, email: e.target.value }))}
            />
          </label>
        </div>
      </Modal>

      <Modal
        open={Boolean(rejectPrompt)}
        onOpenChange={(open) => {
          if (!open) setRejectPrompt(null);
        }}
        title="Reject lead"
        footer={
          rejectPrompt ? (
            <>
              <Button variant="secondary" onClick={() => setRejectPrompt(null)}>
                Cancel
              </Button>
              <Button
                loading={saving}
                onClick={() => {
                  const prompt = rejectPrompt;
                  setRejectPrompt(null);
                  void transitionLead(
                    prompt.leadId,
                    "rejected",
                    prompt.substatus.trim() || null,
                  );
                }}
              >
                Move to Rejected
              </Button>
            </>
          ) : null
        }
      >
        {rejectPrompt ? (
          <div className="space-y-3">
            <label className="block space-y-1 text-sm">
              <span className="crm-label">Substatus (from sheet Status)</span>
              <input
                className="crm-input w-full"
                value={rejectPrompt.substatus}
                onChange={(e) =>
                  setRejectPrompt((p) => (p ? { ...p, substatus: e.target.value } : p))
                }
                placeholder="e.g. Unreachable, Not Relevant…"
              />
            </label>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
