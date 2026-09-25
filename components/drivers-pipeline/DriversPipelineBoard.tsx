"use client";

import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Ban, CalendarDays, Loader2, Phone, Plus, Search, Trash2, UserRound, X } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { Drawer, Modal } from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Toast";
import { ClickToCallButton } from "@/components/call-center/DriverCallButton";
import { cn } from "@/lib/ui/cn";
import {
  DRIVER_STATUS_COLUMNS,
  formatDriverDate,
  formatDriverDateTime,
  type StatusTone,
} from "@/lib/drivers-pipeline/display";
import {
  buildDriverPhoneDuplicateHints,
  type DriverPhoneDuplicateHint,
} from "@/lib/drivers-pipeline/phone-duplicates";
import {
  getDriverReceivedAtIso,
  getDriverReceivedDayKey,
} from "@/lib/drivers-pipeline/received-at";
import { DRIVER_REJECT_REASONS, driverRejectReasonOptions } from "@/lib/drivers-pipeline/reject-reasons";
import { isDriverNoLicenseLead, NO_TAXI_LICENSE_SUBSTATUS } from "@/lib/drivers-pipeline/taxi-license";
import { getPlatformStaffUserOptions } from "@/lib/sales-operation/crm-manager-users";
import type {
  DriverLead,
  DriverLeadNote,
  DriverLeadStatus,
} from "@/lib/drivers-pipeline/types";

const CARD_ESTIMATE_PX = 112;
const CARD_GAP_PX = 10;

const toneClass: Record<StatusTone, string> = {
  gray: "bg-zinc-100 text-zinc-700",
  blue: "bg-sky-100 text-sky-800",
  green: "bg-emerald-100 text-emerald-800",
  red: "bg-rose-100 text-rose-800",
  yellow: "bg-amber-100 text-amber-900",
};

const dupCardClass: Record<DriverPhoneDuplicateHint["tone"], string> = {
  registered: "dp-card-dup-registered",
  rejected: "dp-card-dup-rejected",
  open: "dp-card-dup-open",
};

const dupChipClass: Record<DriverPhoneDuplicateHint["tone"], string> = {
  registered: "bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200/80",
  rejected: "bg-rose-50 text-rose-800 ring-1 ring-inset ring-rose-200/80",
  open: "bg-amber-50 text-amber-900 ring-1 ring-inset ring-amber-200/80",
};

const dupBannerClass: Record<DriverPhoneDuplicateHint["tone"], string> = {
  registered: "border-emerald-200 bg-emerald-50 text-emerald-900",
  rejected: "border-rose-200 bg-rose-50 text-rose-900",
  open: "border-amber-200 bg-amber-50 text-amber-950",
};

function leadInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}

function isNoLicenseLead(lead: DriverLead): boolean {
  return isDriverNoLicenseLead(lead);
}

function duplicateLabel(hint: DriverPhoneDuplicateHint): string {
  const name = hint.match.fullName || "another lead";
  if (hint.tone === "registered") {
    return `Phone already in CRM · hired: ${name}`;
  }
  if (hint.tone === "rejected") {
    return `Phone already in CRM · rejected: ${name}${
      hint.match.rejectedSubstatus ? ` (${hint.match.rejectedSubstatus})` : ""
    }`;
  }
  return `Phone already in CRM · open: ${name}`;
}

function nowDatetimeLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function datetimeLocalToSheetDate(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = trimmed.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2})?/,
  );
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  return `${day}/${month}/${year} ${hour}:${minute}`;
}

const EMPTY_CREATE_DRAFT = {
  fullName: "",
  email: "",
  phone: "",
  receivedAt: "",
  status: "new" as DriverLeadStatus,
  rejectedSubstatus: "",
  assigneeUserId: "",
  taxiLicense: "" as "" | "yes" | "no",
  campaignName: "",
  generalNotes: "",
};

type DriverLeadCardProps = {
  lead: DriverLead;
  dup: DriverPhoneDuplicateHint | undefined;
  isChecked: boolean;
  isSelected: boolean;
  justArrived: boolean;
  onSelect: (id: string) => void;
  onToggleChecked: (id: string, next: boolean) => void;
};

const DriverLeadCard = memo(function DriverLeadCard({
  lead,
  dup,
  isChecked,
  isSelected,
  justArrived,
  onSelect,
  onToggleChecked,
}: DriverLeadCardProps) {
  const contact = lead.phone || lead.email || null;
  return (
    <article
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/driver-lead-id", lead.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={() => onSelect(lead.id)}
      className={cn(
        "dp-card group cursor-pointer text-left",
        isSelected && "dp-card-selected",
        isChecked && "dp-card-checked",
        justArrived && "dp-card-arrive",
        dup && dupCardClass[dup.tone],
      )}
    >
      <div className="flex items-start gap-2.5">
        <label
          className="dp-card-check mt-0.5"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            className="so-focus-ring h-3.5 w-3.5 accent-[var(--accent)]"
            checked={isChecked}
            aria-label={`Select ${lead.fullName}`}
            onChange={(e) => onToggleChecked(lead.id, e.target.checked)}
          />
        </label>

        <div
          className="dp-avatar"
          aria-hidden
        >
          {leadInitials(lead.fullName)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-[0.8125rem] font-semibold tracking-[-0.01em] text-[var(--so-text)]">
                {lead.fullName}
              </p>
              {contact ? (
                <p className="mt-0.5 flex items-center gap-1 truncate text-[0.72rem] text-[var(--so-muted)]">
                  {lead.phone ? (
                    <Phone className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
                  ) : null}
                  <span className="truncate">{contact}</span>
                </p>
              ) : (
                <p className="mt-0.5 text-[0.72rem] text-[var(--so-muted-2)]">No contact</p>
              )}
            </div>
            {lead.phone ? (
              <div className="dp-dial shrink-0" onClick={(e) => e.stopPropagation()}>
                <ClickToCallButton
                  phone={lead.phone}
                  variant="pill"
                  label="Dial"
                  entityType="driver"
                  entityId={lead.id}
                  compact
                />
              </div>
            ) : null}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1">
            <span className="dp-chip">
              <CalendarDays className="h-3 w-3 opacity-70" aria-hidden />
              {formatDriverDate(getDriverReceivedAtIso(lead))}
            </span>
            {lead.assignedManagerName ? (
              <span className="dp-chip max-w-[8.5rem]">
                <UserRound className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
                <span className="truncate">{lead.assignedManagerName}</span>
              </span>
            ) : null}
            {lead.status === "rejected" && lead.rejectedSubstatus ? (
              <span className="dp-chip dp-chip-reject max-w-[9.5rem]">
                <Ban className="h-3 w-3 shrink-0 opacity-80" aria-hidden />
                <span className="truncate">{lead.rejectedSubstatus}</span>
              </span>
            ) : null}
            {dup ? (
              <span className={cn("dp-chip", dupChipClass[dup.tone])}>
                {dup.tone === "registered"
                  ? "Dup · hired"
                  : dup.tone === "rejected"
                    ? "Dup · rejected"
                    : "Dup phone"}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
});

type DriversColumnProps = {
  status: DriverLeadStatus;
  label: string;
  tone: StatusTone;
  leads: DriverLead[];
  phoneDupHints: Map<string, DriverPhoneDuplicateHint>;
  checkedIds: Set<string>;
  selectedId: string | null;
  arrivedIds: Set<string>;
  isDropTarget: boolean;
  onDragOverStatus: (status: DriverLeadStatus | null) => void;
  onDropLead: (status: DriverLeadStatus, leadId: string) => void;
  onToggleColumnChecked: (status: DriverLeadStatus) => void;
  onSelect: (id: string) => void;
  onToggleChecked: (id: string, next: boolean) => void;
};

function DriversPipelineColumn({
  status,
  label,
  tone,
  leads,
  phoneDupHints,
  checkedIds,
  selectedId,
  arrivedIds,
  isDropTarget,
  onDragOverStatus,
  onDropLead,
  onToggleColumnChecked,
  onSelect,
  onToggleChecked,
}: DriversColumnProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const allSelected =
    leads.length > 0 && leads.every((lead) => checkedIds.has(lead.id));

  const virtualizer = useVirtualizer({
    count: leads.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => CARD_ESTIMATE_PX,
    overscan: 10,
    gap: CARD_GAP_PX,
  });

  return (
    <section
      className={cn(
        "dp-column flex min-h-0 min-w-[280px] flex-1 flex-col p-2",
        isDropTarget && "dp-column-drop",
      )}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOverStatus(status);
      }}
      onDragLeave={(e) => {
        const related = e.relatedTarget as Node | null;
        if (related && e.currentTarget.contains(related)) return;
        onDragOverStatus(null);
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDragOverStatus(null);
        const leadId = e.dataTransfer.getData("text/driver-lead-id");
        if (leadId) onDropLead(status, leadId);
      }}
    >
      <header className="mb-1.5 flex shrink-0 items-center justify-between gap-2 px-1.5 py-1">
        <div className="flex min-w-0 items-center gap-2">
          <label className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-[8px] transition-colors hover:bg-[var(--so-surface)]">
            <input
              type="checkbox"
              className="so-focus-ring h-3.5 w-3.5 accent-[var(--accent)]"
              aria-label={`Select all in ${label}`}
              checked={allSelected}
              onChange={() => onToggleColumnChecked(status)}
            />
          </label>
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-[0.7rem] font-semibold tracking-[-0.01em]",
              toneClass[tone],
            )}
          >
            {label}
          </span>
        </div>
        <span className="dp-count-pill tabular-nums">{leads.length}</span>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-0.5 pb-0.5">
        {leads.length === 0 ? (
          <p className="px-2 py-8 text-center text-xs text-[var(--so-muted)]">No leads</p>
        ) : (
          <div
            className="relative w-full"
            style={{ height: virtualizer.getTotalSize() }}
          >
            {virtualizer.getVirtualItems().map((item) => {
              const lead = leads[item.index]!;
              return (
                <div
                  key={lead.id}
                  data-index={item.index}
                  ref={virtualizer.measureElement}
                  className="absolute top-0 left-0 w-full"
                  style={{ transform: `translateY(${item.start}px)` }}
                >
                  <DriverLeadCard
                    lead={lead}
                    dup={phoneDupHints.get(lead.id)}
                    isChecked={checkedIds.has(lead.id)}
                    isSelected={selectedId === lead.id}
                    justArrived={arrivedIds.has(lead.id)}
                    onSelect={onSelect}
                    onToggleChecked={onToggleChecked}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

export function DriversPipelineBoard() {
  const toast = useToast();
  const confirm = useConfirm();
  const searchParams = useSearchParams();
  const { users } = useAuth();
  const staffOptions = useMemo(() => getPlatformStaffUserOptions(users), [users]);
  const [leads, setLeads] = useState<DriverLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => new Set());
  const [notes, setNotes] = useState<DriverLeadNote[]>([]);
  const [noteDraft, setNoteDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState(EMPTY_CREATE_DRAFT);
  const [dragOverStatus, setDragOverStatus] = useState<DriverLeadStatus | null>(null);
  const [rejectPrompt, setRejectPrompt] = useState<{
    leadIds: string[];
    substatus: string;
  } | null>(null);
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
  const [bulkAssignUserId, setBulkAssignUserId] = useState("");
  const [filterAssignee, setFilterAssignee] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterRejectReason, setFilterRejectReason] = useState("");
  const [arrivedIds, setArrivedIds] = useState<Set<string>>(() => new Set());
  const arrivedTimersRef = useRef<Record<string, number>>({});

  const deferredQuery = useDeferredValue(query);
  const deferredAssignee = useDeferredValue(filterAssignee);
  const deferredDateFrom = useDeferredValue(filterDateFrom);
  const deferredDateTo = useDeferredValue(filterDateTo);
  const deferredRejectReason = useDeferredValue(filterRejectReason);

  const markArrived = useCallback((leadIds: string[]) => {
    if (leadIds.length === 0) return;
    setArrivedIds((prev) => {
      const next = new Set(prev);
      for (const id of leadIds) next.add(id);
      return next;
    });
    for (const id of leadIds) {
      window.clearTimeout(arrivedTimersRef.current[id]);
      arrivedTimersRef.current[id] = window.setTimeout(() => {
        setArrivedIds((prev) => {
          if (!prev.has(id)) return prev;
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        delete arrivedTimersRef.current[id];
      }, 220);
    }
  }, []);

  useEffect(() => {
    const timers = arrivedTimersRef.current;
    return () => {
      for (const timer of Object.values(timers)) window.clearTimeout(timer);
    };
  }, []);

  const selected = useMemo(
    () => leads.find((l) => l.id === selectedId) ?? null,
    [leads, selectedId],
  );

  const assigneeSelectValue = useMemo(() => {
    if (!selected) return "";
    if (selected.assignedManagerUserId) return selected.assignedManagerUserId;
    if (selected.assignedManagerName?.trim()) {
      return `legacy:${selected.assignedManagerName.trim()}`;
    }
    return "";
  }, [selected]);

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

  const phoneDupHints = useMemo(() => buildDriverPhoneDuplicateHints(leads), [leads]);

  const assigneeFilterOptions = useMemo(() => {
    const legacy = new Map<string, string>();
    for (const lead of leads) {
      if (lead.assignedManagerUserId) continue;
      const name = lead.assignedManagerName?.trim();
      if (!name || name.toLowerCase() === "unassigned") continue;
      legacy.set(`legacy:${name}`, name);
    }
    return {
      staff: staffOptions,
      legacy: [...legacy.entries()]
        .map(([value, label]) => ({ value, label }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    };
  }, [leads, staffOptions]);

  const rejectReasonFilterOptions = useMemo(() => {
    const set = new Set<string>(DRIVER_REJECT_REASONS);
    for (const lead of leads) {
      const reason = lead.rejectedSubstatus?.trim();
      if (reason) set.add(reason);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [leads]);

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    return leads
      .filter((lead) => {
        if (q) {
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
          if (!hay.includes(q)) return false;
        }

        if (deferredAssignee === "__unassigned__") {
          if (lead.assignedManagerUserId || lead.assignedManagerName?.trim()) return false;
        } else if (deferredAssignee.startsWith("legacy:")) {
          const name = deferredAssignee.slice("legacy:".length);
          if (lead.assignedManagerUserId || lead.assignedManagerName !== name) return false;
        } else if (deferredAssignee) {
          if (lead.assignedManagerUserId !== deferredAssignee) return false;
        }

        if (deferredRejectReason) {
          if (lead.rejectedSubstatus !== deferredRejectReason) return false;
        }

        if (deferredDateFrom || deferredDateTo) {
          const day = getDriverReceivedDayKey(lead);
          if (deferredDateFrom && day < deferredDateFrom) return false;
          if (deferredDateTo && day > deferredDateTo) return false;
        }

        return true;
      })
      .sort((a, b) => getDriverReceivedAtIso(b).localeCompare(getDriverReceivedAtIso(a)));
  }, [
    leads,
    deferredQuery,
    deferredAssignee,
    deferredDateFrom,
    deferredDateTo,
    deferredRejectReason,
  ]);

  const filtersActive = Boolean(
    filterAssignee || filterDateFrom || filterDateTo || filterRejectReason,
  );

  const byStatus = useMemo(() => {
    const map = Object.fromEntries(
      DRIVER_STATUS_COLUMNS.map((c) => [c.status, [] as DriverLead[]]),
    ) as Record<DriverLeadStatus, DriverLead[]>;
    for (const lead of filtered) {
      map[lead.status]?.push(lead);
    }
    return map;
  }, [filtered]);

  const checkedCount = checkedIds.size;
  const checkedList = useMemo(() => [...checkedIds], [checkedIds]);

  const onToggleChecked = useCallback((leadId: string, next: boolean) => {
    setCheckedIds((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(leadId);
      else copy.delete(leadId);
      return copy;
    });
  }, []);

  const onSelectLead = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  const onDragOverStatus = useCallback((status: DriverLeadStatus | null) => {
    setDragOverStatus(status);
  }, []);

  const onToggleColumnChecked = useCallback(
    (status: DriverLeadStatus) => {
      const columnIds = (byStatus[status] ?? []).map((lead) => lead.id);
      if (columnIds.length === 0) return;
      setCheckedIds((prev) => {
        const allSelected = columnIds.every((id) => prev.has(id));
        const copy = new Set(prev);
        for (const id of columnIds) {
          if (allSelected) copy.delete(id);
          else copy.add(id);
        }
        return copy;
      });
    },
    [byStatus],
  );

  function clearChecked() {
    setCheckedIds(new Set());
  }

  async function runBulkAction(
    body: Record<string, unknown>,
    successMessage: string,
  ): Promise<boolean> {
    const ids = Array.isArray(body.ids)
      ? body.ids.filter((id): id is string => typeof id === "string")
      : checkedList;
    setSaving(true);
    try {
      const res = await fetch("/api/sales-operation/drivers-leads/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { ok?: boolean; updated?: number; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Bulk action failed.");
      await loadLeads();
      if (body.action === "delete" && selectedId && ids.includes(selectedId)) {
        setSelectedId(null);
      }
      clearChecked();
      if (body.action === "transition") {
        markArrived(ids);
      }
      toast.success(successMessage.replace("{n}", String(json.updated ?? ids.length)));
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bulk action failed.");
      return false;
    } finally {
      setSaving(false);
    }
  }

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
      markArrived([json.lead.id]);
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
      if (isNoLicenseLead(lead)) {
        await transitionLead(leadId, "rejected", NO_TAXI_LICENSE_SUBSTATUS);
        return;
      }
      setRejectPrompt({ leadIds: [leadId], substatus: lead.rejectedSubstatus ?? "" });
      return;
    }
    await transitionLead(leadId, toStatus, null);
  }

  async function bulkMoveTo(toStatus: DriverLeadStatus) {
    if (checkedList.length === 0) return;
    if (toStatus === "rejected") {
      const onlyNoLicense = checkedList.every((id) => {
        const lead = leads.find((item) => item.id === id);
        return lead ? isNoLicenseLead(lead) : false;
      });
      if (onlyNoLicense) {
        await runBulkAction(
          {
            action: "transition",
            ids: checkedList,
            toStatus: "rejected",
            rejectedSubstatus: NO_TAXI_LICENSE_SUBSTATUS,
          },
          "Moved {n} leads to Rejected.",
        );
        return;
      }
      setRejectPrompt({ leadIds: checkedList, substatus: "" });
      return;
    }
    await runBulkAction(
      { action: "transition", ids: checkedList, toStatus },
      `Moved {n} leads to ${DRIVER_STATUS_COLUMNS.find((c) => c.status === toStatus)?.label ?? toStatus}.`,
    );
  }

  async function bulkDelete() {
    if (checkedList.length === 0) return;
    const ok = await confirm({
      title: `Delete ${checkedList.length} lead${checkedList.length === 1 ? "" : "s"}?`,
      description: "This permanently removes the selected driver leads.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    await runBulkAction(
      { action: "delete", ids: checkedList },
      "Deleted {n} leads.",
    );
  }

  async function bulkAssign() {
    if (checkedList.length === 0) return;
    const staff = staffOptions.find((user) => user.id === bulkAssignUserId);
    const ok = await runBulkAction(
      {
        action: "assign",
        ids: checkedList,
        assignedManagerUserId: bulkAssignUserId || null,
        assignedManagerName: staff?.name ?? null,
      },
      bulkAssignUserId ? "Reassigned {n} leads." : "Unassigned {n} leads.",
    );
    if (ok) {
      setBulkAssignOpen(false);
      setBulkAssignUserId("");
    }
  }

  async function saveSelected(patch: Partial<DriverLead>) {
    if (!selected) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        fullName: patch.fullName ?? selected.fullName,
        email: patch.email !== undefined ? patch.email : selected.email,
        phone: patch.phone !== undefined ? patch.phone : selected.phone,
        generalNotes:
          patch.generalNotes !== undefined ? patch.generalNotes : selected.generalNotes,
        rejectedSubstatus:
          patch.rejectedSubstatus !== undefined
            ? patch.rejectedSubstatus
            : selected.rejectedSubstatus,
      };
      if (
        patch.assignedManagerUserId !== undefined ||
        patch.assignedManagerName !== undefined
      ) {
        body.assignedManagerUserId =
          patch.assignedManagerUserId !== undefined
            ? patch.assignedManagerUserId
            : selected.assignedManagerUserId;
        body.assignedManagerName =
          patch.assignedManagerName !== undefined
            ? patch.assignedManagerName
            : selected.assignedManagerName;
      }
      const res = await fetch(`/api/sales-operation/drivers-leads/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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
    const noLicense = createDraft.taxiLicense === "no";
    let status: DriverLeadStatus = createDraft.status;
    let rejectedSubstatus: string | null =
      status === "rejected" ? createDraft.rejectedSubstatus.trim() || null : null;
    if (noLicense) {
      status = "rejected";
      rejectedSubstatus = NO_TAXI_LICENSE_SUBSTATUS;
    } else if (status === "rejected" && !rejectedSubstatus) {
      toast.error("Select a reject reason.");
      return;
    }

    const assignee = staffOptions.find((user) => user.id === createDraft.assigneeUserId);
    const sheetDate = datetimeLocalToSheetDate(createDraft.receivedAt);
    const customFields: Record<string, unknown> = {};
    if (sheetDate) customFields.sheet_date = sheetDate;
    if (createDraft.taxiLicense === "yes" || createDraft.taxiLicense === "no") {
      customFields.taxi_license = createDraft.taxiLicense;
      customFields.taxi_license_normalized = createDraft.taxiLicense;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/sales-operation/drivers-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: createDraft.fullName.trim(),
          email: createDraft.email.trim() || null,
          phone: createDraft.phone.trim() || null,
          status,
          rejectedSubstatus,
          source: "manual",
          campaignName: createDraft.campaignName.trim() || null,
          generalNotes: createDraft.generalNotes.trim() || null,
          assignedManagerUserId: assignee?.id ?? null,
          assignedManagerName: assignee?.name ?? null,
          customFields,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; lead?: DriverLead; error?: string };
      if (!res.ok || !json.ok || !json.lead) throw new Error(json.error ?? "Create failed.");
      setLeads((prev) => [json.lead!, ...prev]);
      setCreateOpen(false);
      setCreateDraft({ ...EMPTY_CREATE_DRAFT, receivedAt: nowDatetimeLocal() });
      setSelectedId(json.lead.id);
      toast.success("Lead created.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Create failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-4 sm:px-5">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          className="h-10 rounded-[10px] px-4 shadow-[var(--so-shadow-xs)]"
          onClick={() => {
            setCreateDraft({ ...EMPTY_CREATE_DRAFT, receivedAt: nowDatetimeLocal() });
            setCreateOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          Add lead
        </Button>
      </div>

      <div className="dp-filter-bar">
        <label className="dp-filter-search">
          <Search className="dp-filter-search-icon" aria-hidden />
          <input
            className="dp-filter-search-input"
            placeholder="Search name, phone, campaign…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>

        <div className="dp-filter-divider" aria-hidden />

        <label className="dp-filter-field min-w-[11rem] flex-1">
          <span className="dp-filter-label">
            <UserRound className="h-3 w-3" aria-hidden />
            Hub expert
          </span>
          <select
            className="dp-filter-control"
            value={filterAssignee}
            onChange={(e) => setFilterAssignee(e.target.value)}
          >
            <option value="">All assignees</option>
            <option value="__unassigned__">Unassigned</option>
            {assigneeFilterOptions.staff.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
            {assigneeFilterOptions.legacy.length > 0 ? (
              <optgroup label="Legacy names">
                {assigneeFilterOptions.legacy.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </select>
        </label>

        <div className="dp-filter-range">
          <label className="dp-filter-field">
            <span className="dp-filter-label">
              <CalendarDays className="h-3 w-3" aria-hidden />
              From
            </span>
            <input
              type="date"
              className="dp-filter-control"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
            />
          </label>
          <span className="dp-filter-range-sep" aria-hidden>
            –
          </span>
          <label className="dp-filter-field">
            <span className="dp-filter-label">To</span>
            <input
              type="date"
              className="dp-filter-control"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
            />
          </label>
        </div>

        <label className="dp-filter-field min-w-[10.5rem] flex-1">
          <span className="dp-filter-label">
            <Ban className="h-3 w-3" aria-hidden />
            Reject reason
          </span>
          <select
            className="dp-filter-control"
            value={filterRejectReason}
            onChange={(e) => setFilterRejectReason(e.target.value)}
          >
            <option value="">All reasons</option>
            {rejectReasonFilterOptions.map((reason) => (
              <option key={reason} value={reason}>
                {reason}
              </option>
            ))}
          </select>
        </label>

        <div className="dp-filter-meta">
          {filtersActive ? (
            <button
              type="button"
              className="dp-filter-clear"
              onClick={() => {
                setFilterAssignee("");
                setFilterDateFrom("");
                setFilterDateTo("");
                setFilterRejectReason("");
              }}
            >
              <X className="h-3.5 w-3.5" />
              Clear
            </button>
          ) : null}
          <span className="dp-count-pill tabular-nums">
            {filtered.length}
            <span className="text-[var(--so-muted-2)]"> / {leads.length}</span>
          </span>
        </div>
      </div>

      <div
        className={cn(
          "overflow-hidden transition-[max-height,opacity,margin] duration-200 ease-[var(--ease-ui)]",
          checkedCount > 0
            ? "dp-bulk-bar mb-0 max-h-24 opacity-100"
            : "pointer-events-none mb-0 max-h-0 opacity-0",
        )}
        aria-hidden={checkedCount === 0}
      >
        <div className="flex flex-wrap items-center gap-2 rounded-[12px] border border-[var(--so-accent)]/30 bg-[var(--so-accent-soft)] px-3.5 py-2.5 shadow-[var(--so-shadow-xs)]">
          <p className="text-[0.8125rem] font-semibold tracking-[-0.01em] text-[var(--so-text)]">
            {checkedCount} selected
          </p>
          <select
            className="dp-filter-control h-9 min-w-[10rem]"
            defaultValue=""
            disabled={saving || checkedCount === 0}
            key={checkedCount}
            onChange={(e) => {
              const value = e.target.value as DriverLeadStatus | "";
              e.target.value = "";
              if (value) void bulkMoveTo(value);
            }}
          >
            <option value="">Move to…</option>
            {DRIVER_STATUS_COLUMNS.map((column) => (
              <option key={column.status} value={column.status}>
                {column.label}
              </option>
            ))}
          </select>
          <Button
            variant="secondary"
            className="h-9"
            disabled={saving || checkedCount === 0}
            onClick={() => {
              setBulkAssignUserId("");
              setBulkAssignOpen(true);
            }}
          >
            Reassign…
          </Button>
          <Button
            variant="destructive"
            className="h-9"
            disabled={saving || checkedCount === 0}
            onClick={() => void bulkDelete()}
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
          <Button
            variant="ghost"
            className="h-9"
            disabled={saving || checkedCount === 0}
            onClick={clearChecked}
          >
            Clear
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center text-[var(--so-muted)]">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading…
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-1">
          {DRIVER_STATUS_COLUMNS.map((column) => (
            <DriversPipelineColumn
              key={column.status}
              status={column.status}
              label={column.label}
              tone={column.tone}
              leads={byStatus[column.status] ?? []}
              phoneDupHints={phoneDupHints}
              checkedIds={checkedIds}
              selectedId={selectedId}
              arrivedIds={arrivedIds}
              isDropTarget={dragOverStatus === column.status}
              onDragOverStatus={onDragOverStatus}
              onDropLead={(toStatus, leadId) => {
                void onDropStatus(toStatus, leadId);
              }}
              onToggleColumnChecked={onToggleColumnChecked}
              onSelect={onSelectLead}
              onToggleChecked={onToggleChecked}
            />
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
          <div className="space-y-5 px-5 py-4">
            {(() => {
              const dup = phoneDupHints.get(selected.id);
              if (!dup) return null;
              return (
                <div
                  className={cn(
                    "rounded-[var(--so-radius)] border px-3 py-2.5 text-sm",
                    dupBannerClass[dup.tone],
                  )}
                >
                  <p className="font-medium">{duplicateLabel(dup)}</p>
                  {dup.matchCount > 1 ? (
                    <p className="mt-0.5 text-xs opacity-80">
                      +{dup.matchCount - 1} more with same phone
                    </p>
                  ) : null}
                </div>
              );
            })()}

            <section className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="dp-drawer-section-title">Overview</h2>
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

              <div className="dp-drawer-callout px-3 py-2 text-sm">
                <span className="crm-label">Received</span>
                <p className="mt-0.5 font-medium text-[var(--so-text)]">
                  {formatDriverDateTime(getDriverReceivedAtIso(selected))}
                </p>
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
                  <span className="crm-label">Reject reason</span>
                  <select
                    className="crm-input w-full"
                    value={selected.rejectedSubstatus ?? ""}
                    key={`sub-${selected.id}-${selected.updatedAt}`}
                    onChange={(e) => {
                      const next = e.target.value.trim() || null;
                      if (next !== selected.rejectedSubstatus) {
                        void saveSelected({ rejectedSubstatus: next });
                      }
                    }}
                  >
                    <option value="">Select reason…</option>
                    {driverRejectReasonOptions(selected.rejectedSubstatus).map((reason) => (
                      <option key={reason} value={reason}>
                        {reason}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
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
                        "rounded-full px-2.5 py-1 text-xs font-medium transition-colors duration-150 disabled:opacity-50",
                        toneClass[column.tone],
                        selected.status === column.status && "ring-2 ring-[var(--accent)]",
                      )}
                      onClick={() => {
                        if (column.status === "rejected") {
                          if (isNoLicenseLead(selected)) {
                            void transitionLead(
                              selected.id,
                              "rejected",
                              NO_TAXI_LICENSE_SUBSTATUS,
                            );
                            return;
                          }
                          setRejectPrompt({
                            leadIds: [selected.id],
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
            </section>

            <section className="space-y-3 border-t border-[var(--so-border)] pt-4">
              <h2 className="dp-drawer-section-title">Assignment</h2>
              <label className="block space-y-1 text-sm">
                <span className="crm-label">Hub expert / assignee</span>
                <select
                  className="crm-input w-full"
                  value={assigneeSelectValue}
                  key={`assignee-${selected.id}-${selected.updatedAt}`}
                  disabled={saving}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value.startsWith("legacy:")) return;
                    if (!value) {
                      if (selected.assignedManagerUserId || selected.assignedManagerName) {
                        void saveSelected({
                          assignedManagerUserId: null,
                          assignedManagerName: null,
                        });
                      }
                      return;
                    }
                    const staff = staffOptions.find((user) => user.id === value);
                    if (!staff) return;
                    if (
                      staff.id !== selected.assignedManagerUserId ||
                      staff.name !== selected.assignedManagerName
                    ) {
                      void saveSelected({
                        assignedManagerUserId: staff.id,
                        assignedManagerName: staff.name,
                      });
                    }
                  }}
                >
                  <option value="">Unassigned</option>
                  {selected.assignedManagerName && !selected.assignedManagerUserId ? (
                    <option value={`legacy:${selected.assignedManagerName}`}>
                      {selected.assignedManagerName} (legacy)
                    </option>
                  ) : null}
                  {staffOptions.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </select>
              </label>
            </section>

            <section className="space-y-3 border-t border-[var(--so-border)] pt-4">
              <h2 className="dp-drawer-section-title">Activity</h2>
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
                    className="rounded-[var(--so-radius)] border border-[var(--so-border)] bg-[var(--so-surface)] px-3 py-2 text-sm"
                  >
                    <p>{note.body}</p>
                    <p className="mt-1 text-[11px] text-[var(--so-muted)]">
                      {note.authorName} · {formatDriverDateTime(note.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        ) : null}
      </Drawer>

      <Modal
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Add driver lead"
        className="max-w-xl"
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
        <div className="max-h-[min(70vh,36rem)] space-y-4 overflow-y-auto pr-1">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1 text-sm sm:col-span-2">
              <span className="crm-label">Full name</span>
              <input
                className="crm-input w-full"
                value={createDraft.fullName}
                autoFocus
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
                type="email"
                value={createDraft.email}
                onChange={(e) => setCreateDraft((d) => ({ ...d, email: e.target.value }))}
              />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="crm-label">Received</span>
              <input
                className="crm-input w-full"
                type="datetime-local"
                value={createDraft.receivedAt}
                onChange={(e) => setCreateDraft((d) => ({ ...d, receivedAt: e.target.value }))}
              />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="crm-label">Taxi license</span>
              <select
                className="crm-input w-full"
                value={createDraft.taxiLicense}
                onChange={(e) => {
                  const taxiLicense = e.target.value as "" | "yes" | "no";
                  setCreateDraft((d) => ({
                    ...d,
                    taxiLicense,
                    ...(taxiLicense === "no"
                      ? {
                          status: "rejected" as const,
                          rejectedSubstatus: NO_TAXI_LICENSE_SUBSTATUS,
                        }
                      : {}),
                  }));
                }}
              >
                <option value="">Unknown</option>
                <option value="yes">Yes</option>
                <option value="no">No → Rejected (No license)</option>
              </select>
            </label>
            <label className="block space-y-1 text-sm">
              <span className="crm-label">Status</span>
              <select
                className="crm-input w-full"
                value={createDraft.status}
                disabled={createDraft.taxiLicense === "no"}
                onChange={(e) =>
                  setCreateDraft((d) => ({
                    ...d,
                    status: e.target.value as DriverLeadStatus,
                    rejectedSubstatus:
                      e.target.value === "rejected" ? d.rejectedSubstatus : "",
                  }))
                }
              >
                {DRIVER_STATUS_COLUMNS.map((column) => (
                  <option key={column.status} value={column.status}>
                    {column.label}
                  </option>
                ))}
              </select>
            </label>
            {createDraft.status === "rejected" ? (
              <label className="block space-y-1 text-sm">
                <span className="crm-label">Reject reason</span>
                <select
                  className="crm-input w-full"
                  value={createDraft.rejectedSubstatus}
                  disabled={createDraft.taxiLicense === "no"}
                  onChange={(e) =>
                    setCreateDraft((d) => ({ ...d, rejectedSubstatus: e.target.value }))
                  }
                >
                  <option value="">Select reason…</option>
                  {driverRejectReasonOptions(createDraft.rejectedSubstatus).map((reason) => (
                    <option key={reason} value={reason}>
                      {reason}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="block space-y-1 text-sm sm:col-span-2">
              <span className="crm-label">Hub expert / assignee</span>
              <select
                className="crm-input w-full"
                value={createDraft.assigneeUserId}
                onChange={(e) =>
                  setCreateDraft((d) => ({ ...d, assigneeUserId: e.target.value }))
                }
              >
                <option value="">Unassigned</option>
                {staffOptions.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1 text-sm sm:col-span-2">
              <span className="crm-label">Campaign</span>
              <input
                className="crm-input w-full"
                value={createDraft.campaignName}
                onChange={(e) =>
                  setCreateDraft((d) => ({ ...d, campaignName: e.target.value }))
                }
              />
            </label>
            <label className="block space-y-1 text-sm sm:col-span-2">
              <span className="crm-label">Notes</span>
              <textarea
                className="crm-input min-h-20 w-full"
                value={createDraft.generalNotes}
                onChange={(e) =>
                  setCreateDraft((d) => ({ ...d, generalNotes: e.target.value }))
                }
              />
            </label>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(rejectPrompt)}
        onOpenChange={(open) => {
          if (!open) {
            setRejectPrompt(null);
          }
        }}
        title={
          rejectPrompt && rejectPrompt.leadIds.length > 1
            ? `Reject ${rejectPrompt.leadIds.length} leads`
            : "Reject lead"
        }
        footer={
          rejectPrompt ? (
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  setRejectPrompt(null);
                }}
              >
                Cancel
              </Button>
              <Button
                loading={saving}
                disabled={!rejectPrompt.substatus.trim()}
                onClick={() => {
                  const prompt = rejectPrompt;
                  const reason = prompt.substatus.trim();
                  if (!reason) {
                    toast.error("Select a reject reason.");
                    return;
                  }
                  setRejectPrompt(null);
                  if (prompt.leadIds.length === 1) {
                    void transitionLead(prompt.leadIds[0]!, "rejected", reason);
                    return;
                  }
                  void runBulkAction(
                    {
                      action: "transition",
                      ids: prompt.leadIds,
                      toStatus: "rejected",
                      rejectedSubstatus: reason,
                    },
                    "Moved {n} leads to Rejected.",
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
            <p className="text-sm text-[var(--so-muted)]">
              Choose why this lead is being rejected. The reason is stored on the card and in
              filters.
            </p>
            <label className="block space-y-1 text-sm">
              <span className="crm-label">Reject reason</span>
              <select
                className="crm-input w-full"
                value={rejectPrompt.substatus}
                autoFocus
                onChange={(e) =>
                  setRejectPrompt((p) => (p ? { ...p, substatus: e.target.value } : p))
                }
              >
                <option value="">Select reason…</option>
                {driverRejectReasonOptions(rejectPrompt.substatus).map((reason) => (
                  <option key={reason} value={reason}>
                    {reason}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={bulkAssignOpen}
        onOpenChange={(open) => {
          if (!open) {
            setBulkAssignOpen(false);
            setBulkAssignUserId("");
          }
        }}
        title={`Reassign ${checkedCount} lead${checkedCount === 1 ? "" : "s"}`}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setBulkAssignOpen(false);
                setBulkAssignUserId("");
              }}
            >
              Cancel
            </Button>
            <Button loading={saving} onClick={() => void bulkAssign()}>
              Apply
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-[var(--so-muted)]">
            Assign selected leads to a Hub expert, or leave unassigned.
          </p>
          <label className="block space-y-1 text-sm">
            <span className="crm-label">Hub expert / assignee</span>
            <select
              className="crm-input w-full"
              value={bulkAssignUserId}
              onChange={(e) => setBulkAssignUserId(e.target.value)}
            >
              <option value="">Unassigned</option>
              {staffOptions.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Modal>
    </div>
  );
}
