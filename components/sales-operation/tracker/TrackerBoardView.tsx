"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  defaultDropAnimationSideEffects,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type DropAnimation,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { getPlatformStaffUserOptions } from "@/lib/sales-operation/crm-manager-users";
import { TrackerTicketCard } from "@/components/sales-operation/tracker/TrackerTicketCard";
import { TrackerTicketDrawer } from "@/components/sales-operation/tracker/TrackerTicketDrawer";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/ui/cn";
import type {
  TrackerLabel,
  TrackerProject,
  TrackerStatus,
  TrackerTicket,
} from "@/lib/sales-operation/tracker-types";
import { TRACKER_PRIORITIES } from "@/lib/sales-operation/tracker-types";

const dropAnimation: DropAnimation = {
  sideEffects: defaultDropAnimationSideEffects({
    styles: { active: { opacity: "0.4" } },
  }),
  duration: 220,
  easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
};

const STATUS_COLORS = ["#94a3b8", "#3b82f6", "#f59e0b", "#8b5cf6", "#22c55e", "#ef4444", "#06b6d4"];

function SortableTicket({
  ticket,
  subtaskCount,
  onOpen,
  onCopyLink,
  onDelete,
}: {
  ticket: TrackerTicket;
  subtaskCount: number;
  onOpen: () => void;
  onCopyLink: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: ticket.id,
    data: { type: "ticket", ticket },
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <TrackerTicketCard
        ticket={ticket}
        onOpen={onOpen}
        isDragging={isDragging}
        subtaskCount={subtaskCount}
        onCopyLink={onCopyLink}
        onDelete={onDelete}
      />
    </div>
  );
}

function InlineComposer({
  placeholder,
  onSubmit,
}: {
  placeholder: string;
  onSubmit: (title: string) => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-1.5 rounded-[10px] px-2 py-2 text-left text-xs font-medium text-[var(--so-muted)] transition hover:bg-[var(--so-surface)] hover:text-[var(--so-text)]"
      >
        <Plus className="h-3.5 w-3.5" />
        {placeholder}
      </button>
    );
  }

  return (
    <form
      className="rounded-[10px] border border-[var(--so-border)] bg-[var(--so-surface)] p-2 shadow-[var(--so-shadow-xs)]"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!title.trim() || saving) return;
        setSaving(true);
        try {
          await onSubmit(title.trim());
          setTitle("");
          setOpen(false);
        } finally {
          setSaving(false);
        }
      }}
    >
      <input
        ref={inputRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={placeholder}
        className="so-focus-ring mb-2 h-9 w-full rounded-[8px] border border-[var(--so-border)] bg-[var(--so-surface-2)] px-2.5 text-sm"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            setTitle("");
          }
        }}
      />
      <div className="flex gap-1.5">
        <Button type="submit" size="sm" disabled={saving || !title.trim()} loading={saving}>
          Add
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            setOpen(false);
            setTitle("");
          }}
        >
          Esc
        </Button>
      </div>
    </form>
  );
}

function StatusColumn({
  status,
  tickets,
  subtaskCountByParent,
  collapsed,
  otherStatuses,
  onToggleCollapse,
  onOpenTicket,
  onCreateTicket,
  onCopyTicketLink,
  onDeleteTicket,
  onRenameStatus,
  onRecolorStatus,
  onSetWip,
  onDeleteStatus,
  canEditStatuses,
}: {
  status: TrackerStatus;
  tickets: TrackerTicket[];
  subtaskCountByParent: Map<string, number>;
  collapsed: boolean;
  otherStatuses: TrackerStatus[];
  onToggleCollapse: () => void;
  onOpenTicket: (id: string) => void;
  onCreateTicket: (statusId: string, title: string) => Promise<void>;
  onCopyTicketLink: (id: string) => void;
  onDeleteTicket: (id: string) => void;
  onRenameStatus: (status: TrackerStatus) => void;
  onRecolorStatus: (status: TrackerStatus, color: string) => void;
  onSetWip: (status: TrackerStatus) => void;
  onDeleteStatus: (status: TrackerStatus) => void;
  canEditStatuses: boolean;
}) {
  const t = useTranslations("salesOperation.tracker");
  const [menuOpen, setMenuOpen] = useState(false);
  const { setNodeRef, isOver } = useDroppable({ id: status.id, data: { type: "status", status } });
  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `status:${status.id}`,
    data: { type: "status-header", status },
    disabled: !canEditStatuses,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const wipExceeded = status.wipLimit != null && tickets.length > status.wipLimit;

  return (
    <motion.div
      layout
      ref={setSortableRef}
      style={style}
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: isDragging ? 0.7 : 1, x: 0 }}
      className={cn(
        "flex w-[300px] shrink-0 flex-col rounded-[16px] border border-[var(--so-border)] bg-[var(--so-surface-2)]/90 backdrop-blur-[2px]",
        collapsed && "w-[56px]",
        isOver && "ring-2 ring-[var(--so-accent)]/30",
      )}
    >
      <div className="flex items-center gap-1.5 border-b border-[var(--so-border)] px-2.5 py-2.5">
        <button type="button" onClick={onToggleCollapse} className="rounded-md p-1 text-[var(--so-muted)] hover:bg-[var(--so-surface)]">
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {!collapsed ? (
          <>
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-0.5 text-left hover:bg-[var(--so-surface)]/70"
              {...(canEditStatuses ? { ...attributes, ...listeners } : {})}
              onDoubleClick={() => canEditStatuses && onRenameStatus(status)}
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: status.color }} />
              <span className="truncate text-sm font-semibold text-[var(--so-text)]">{status.name}</span>
            </button>
            <span
              className={cn(
                "rounded-md px-1.5 py-0.5 text-[11px] font-semibold",
                wipExceeded ? "bg-rose-100 text-rose-700" : "bg-[var(--so-surface)] text-[var(--so-muted)]",
              )}
              title={wipExceeded ? t("wipExceeded") : undefined}
            >
              {tickets.length}
              {status.wipLimit != null ? `/${status.wipLimit}` : ""}
            </span>
            {canEditStatuses ? (
              <div className="relative">
                <button
                  type="button"
                  className="rounded-md p-1 text-[var(--so-muted)] hover:bg-[var(--so-surface)] hover:text-[var(--so-text)]"
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-label="Column menu"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
                {menuOpen ? (
                  <>
                    <button
                      type="button"
                      className="fixed inset-0 z-20 cursor-default"
                      aria-label="Close menu"
                      onClick={() => setMenuOpen(false)}
                    />
                    <div className="absolute right-0 top-8 z-30 min-w-[180px] rounded-[12px] border border-[var(--so-border)] bg-[var(--so-surface)] p-1 shadow-[var(--so-shadow-md)]">
                      <button
                        type="button"
                        className="flex w-full rounded-[8px] px-2.5 py-1.5 text-left text-xs hover:bg-[var(--so-surface-2)]"
                        onClick={() => {
                          setMenuOpen(false);
                          onRenameStatus(status);
                        }}
                      >
                        {t("renameStatus")}
                      </button>
                      <div className="px-2.5 py-1.5">
                        <p className="mb-1 text-[10px] font-semibold uppercase text-[var(--so-muted)]">
                          {t("statusColor")}
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {STATUS_COLORS.map((color) => (
                            <button
                              key={color}
                              type="button"
                              className={cn(
                                "h-5 w-5 rounded-full border border-black/10",
                                status.color === color && "ring-2 ring-[var(--so-accent)]",
                              )}
                              style={{ backgroundColor: color }}
                              onClick={() => {
                                setMenuOpen(false);
                                onRecolorStatus(status, color);
                              }}
                            />
                          ))}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="flex w-full rounded-[8px] px-2.5 py-1.5 text-left text-xs hover:bg-[var(--so-surface-2)]"
                        onClick={() => {
                          setMenuOpen(false);
                          onSetWip(status);
                        }}
                      >
                        {t("wipLimit")}
                      </button>
                      <button
                        type="button"
                        className="flex w-full items-center gap-1.5 rounded-[8px] px-2.5 py-1.5 text-left text-xs text-rose-600 hover:bg-rose-50"
                        onClick={() => {
                          setMenuOpen(false);
                          onDeleteStatus(status);
                        }}
                        disabled={otherStatuses.length === 0 && tickets.length > 0}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {t("deleteStatus")}
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
            ) : null}
          </>
        ) : (
          <span className="truncate text-xs font-semibold" style={{ writingMode: "vertical-rl" }}>
            {status.name}
          </span>
        )}
      </div>

      {!collapsed ? (
        <div
          ref={setNodeRef}
          className={cn(
            "flex min-h-[160px] flex-1 flex-col gap-2 overflow-y-auto p-2 transition-colors",
            isOver && "bg-[var(--so-accent)]/5",
          )}
        >
          <SortableContext items={tickets.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            <AnimatePresence initial={false}>
              {tickets.length === 0 ? (
                <motion.p
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="px-2 py-8 text-center text-xs text-[var(--so-muted-2)]"
                >
                  {t("emptyColumn")}
                </motion.p>
              ) : (
                tickets.map((ticket) => (
                  <SortableTicket
                    key={ticket.id}
                    ticket={ticket}
                    subtaskCount={subtaskCountByParent.get(ticket.id) ?? 0}
                    onOpen={() => onOpenTicket(ticket.id)}
                    onCopyLink={() => onCopyTicketLink(ticket.id)}
                    onDelete={() => onDeleteTicket(ticket.id)}
                  />
                ))
              )}
            </AnimatePresence>
          </SortableContext>
          <InlineComposer
            placeholder={t("newTicket")}
            onSubmit={(title) => onCreateTicket(status.id, title)}
          />
        </div>
      ) : null}
    </motion.div>
  );
}

export function TrackerBoardView({ projectId }: { projectId: string }) {
  const t = useTranslations("salesOperation.tracker");
  const toast = useToast();
  const confirm = useConfirm();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { users, currentUser } = useAuth();
  const staff = useMemo(() => getPlatformStaffUserOptions(users), [users]);

  const [project, setProject] = useState<TrackerProject | null>(null);
  const [statuses, setStatuses] = useState<TrackerStatus[]>([]);
  const [tickets, setTickets] = useState<TrackerTicket[]>([]);
  const [labels, setLabels] = useState<TrackerLabel[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTicket, setActiveTicket] = useState<TrackerTicket | null>(null);
  const [openTicketId, setOpenTicketId] = useState<string | null>(() => searchParams.get("ticket"));
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [q, setQ] = useState("");
  const [filterAssignee, setFilterAssignee] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [filterCreator, setFilterCreator] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const composingRef = useRef(false);

  const canEditStatuses =
    currentUser?.role === "Admin" ||
    currentUser?.role === "Account Manager" ||
    currentUser?.role === "Sales Manager" ||
    currentUser?.role === "Team Lead";

  const loadBoard = useCallback(
    async (search?: string) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (search?.trim()) params.set("q", search.trim());
        if (filterAssignee) params.set("assignee", filterAssignee);
        if (filterPriority) params.set("priority", filterPriority);
        if (filterCreator) params.set("creator", filterCreator);

        const [projectRes, statusRes, ticketRes, labelRes] = await Promise.all([
          fetch(`/api/sales-operation/tracker/projects/${projectId}`, { cache: "no-store" }),
          fetch(`/api/sales-operation/tracker/projects/${projectId}/statuses`, { cache: "no-store" }),
          fetch(`/api/sales-operation/tracker/projects/${projectId}/tickets?${params.toString()}`, {
            cache: "no-store",
          }),
          fetch(`/api/sales-operation/tracker/projects/${projectId}/labels`, { cache: "no-store" }),
        ]);

        const projectData = (await projectRes.json()) as {
          ok?: boolean;
          project?: TrackerProject;
          error?: string;
        };
        const statusData = (await statusRes.json()) as { ok?: boolean; statuses?: TrackerStatus[] };
        const ticketData = (await ticketRes.json()) as { ok?: boolean; tickets?: TrackerTicket[] };
        const labelData = (await labelRes.json()) as { ok?: boolean; labels?: TrackerLabel[] };

        if (!projectRes.ok || !projectData.ok || !projectData.project) {
          toast.error(projectData.error ?? "Project not found");
          return;
        }
        setProject(projectData.project);
        setStatuses(statusData.statuses ?? []);
        setTickets(ticketData.tickets ?? []);
        setLabels(labelData.labels ?? []);
      } finally {
        setLoading(false);
      }
    },
    [projectId, filterAssignee, filterPriority, filterCreator, toast],
  );

  const createTicket = useCallback(
    async (statusId: string, title: string, parentTicketId?: string | null) => {
      const res = await fetch(`/api/sales-operation/tracker/projects/${projectId}/tickets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          statusId,
          parentTicketId: parentTicketId ?? null,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; ticket?: TrackerTicket; error?: string };
      if (!res.ok || !data.ok || !data.ticket) {
        toast.error(data.error ?? "Failed to create");
        throw new Error(data.error ?? "Failed to create");
      }
      setTickets((prev) => [...prev, data.ticket!]);
      if (!parentTicketId) setOpenTicketId(data.ticket.id);
    },
    [projectId, toast],
  );

  useEffect(() => {
    void loadBoard(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadBoard]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (composingRef.current) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if ((e.key === "n" || e.key === "N") && statuses[0]) {
        e.preventDefault();
        const title = window.prompt(t("newTicket"));
        if (title?.trim()) void createTicket(statuses[0]!.id, title.trim());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [statuses, createTicket, t]);

  const topLevelTickets = useMemo(
    () => tickets.filter((ticket) => !ticket.parentTicketId),
    [tickets],
  );

  const subtaskCountByParent = useMemo(() => {
    const map = new Map<string, number>();
    for (const ticket of tickets) {
      if (!ticket.parentTicketId) continue;
      map.set(ticket.parentTicketId, (map.get(ticket.parentTicketId) ?? 0) + 1);
    }
    return map;
  }, [tickets]);

  const ticketsByStatus = useMemo(() => {
    const map = new Map<string, TrackerTicket[]>();
    for (const status of statuses) map.set(status.id, []);
    for (const ticket of topLevelTickets) {
      const list = map.get(ticket.statusId) ?? [];
      list.push(ticket);
      map.set(ticket.statusId, list);
    }
    for (const [id, list] of map) {
      list.sort((a, b) => a.position - b.position);
      map.set(id, list);
    }
    return map;
  }, [statuses, topLevelTickets]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const deleteTicket = async (ticketId: string) => {
    const ok = await confirm({
      title: t("delete"),
      description: t("deleteConfirm"),
      confirmLabel: t("delete"),
      destructive: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/sales-operation/tracker/tickets/${ticketId}`, { method: "DELETE" });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) {
      toast.error(data.error ?? "Failed to delete");
      return;
    }
    setTickets((prev) => prev.filter((t) => t.id !== ticketId && t.parentTicketId !== ticketId));
    if (openTicketId === ticketId) {
      setOpenTicketId(null);
      router.replace("?", { scroll: false });
    }
    toast.success(t("deleted"));
  };

  const copyTicketLink = async (ticketId: string) => {
    const url = `${window.location.origin}/sales-operation/tracker/${projectId}?ticket=${ticketId}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("linkCopied"));
    } catch {
      toast.error(t("linkCopyFailed"));
    }
  };

  const renameStatus = async (status: TrackerStatus) => {
    const name = window.prompt(t("statusName"), status.name);
    if (!name?.trim() || name.trim() === status.name) return;
    const res = await fetch(
      `/api/sales-operation/tracker/projects/${projectId}/statuses/${status.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      },
    );
    const data = (await res.json()) as { ok?: boolean; status?: TrackerStatus; error?: string };
    if (!res.ok || !data.ok || !data.status) {
      toast.error(data.error ?? "Failed to rename");
      return;
    }
    setStatuses((prev) => prev.map((s) => (s.id === status.id ? data.status! : s)));
  };

  const recolorStatus = async (status: TrackerStatus, color: string) => {
    const res = await fetch(
      `/api/sales-operation/tracker/projects/${projectId}/statuses/${status.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ color }),
      },
    );
    const data = (await res.json()) as { ok?: boolean; status?: TrackerStatus; error?: string };
    if (!res.ok || !data.ok || !data.status) {
      toast.error(data.error ?? "Failed to update color");
      return;
    }
    setStatuses((prev) => prev.map((s) => (s.id === status.id ? data.status! : s)));
  };

  const setWip = async (status: TrackerStatus) => {
    const raw = window.prompt(t("wipLimit"), status.wipLimit != null ? String(status.wipLimit) : "");
    if (raw === null) return;
    const wipLimit = raw.trim() === "" ? null : Number(raw);
    if (wipLimit != null && (!Number.isFinite(wipLimit) || wipLimit < 0)) {
      toast.error("Invalid WIP limit");
      return;
    }
    const res = await fetch(
      `/api/sales-operation/tracker/projects/${projectId}/statuses/${status.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wipLimit }),
      },
    );
    const data = (await res.json()) as { ok?: boolean; status?: TrackerStatus; error?: string };
    if (!res.ok || !data.ok || !data.status) {
      toast.error(data.error ?? "Failed to update WIP");
      return;
    }
    setStatuses((prev) => prev.map((s) => (s.id === status.id ? data.status! : s)));
  };

  const deleteStatus = async (status: TrackerStatus) => {
    const others = statuses.filter((s) => s.id !== status.id);
    const columnTickets = ticketsByStatus.get(status.id) ?? [];
    let moveToStatusId: string | undefined;

    if (columnTickets.length > 0) {
      if (others.length === 0) {
        toast.error(t("cannotDeleteLastStatus"));
        return;
      }
      if (others.length === 1) {
        moveToStatusId = others[0]!.id;
      } else {
        const labels = others.map((s, i) => `${i + 1}) ${s.name}`).join("\n");
        const choice = window.prompt(
          `${t("moveTicketsBeforeDelete", { count: columnTickets.length })}\n\n${labels}`,
          "1",
        );
        const index = Number(choice) - 1;
        if (!Number.isInteger(index) || index < 0 || index >= others.length) {
          toast.error(t("deleteStatusCancelled"));
          return;
        }
        moveToStatusId = others[index]!.id;
      }
    }

    const ok = await confirm({
      title: t("deleteStatus"),
      description: t("deleteStatusConfirm", { name: status.name }),
      confirmLabel: t("delete"),
      destructive: true,
    });
    if (!ok) return;

    const url = new URL(
      `/api/sales-operation/tracker/projects/${projectId}/statuses/${status.id}`,
      window.location.origin,
    );
    if (moveToStatusId) url.searchParams.set("moveToStatusId", moveToStatusId);
    const res = await fetch(url.pathname + url.search, { method: "DELETE" });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) {
      toast.error(data.error ?? "Failed to delete status");
      return;
    }
    if (moveToStatusId) {
      setTickets((prev) =>
        prev.map((ticket) =>
          ticket.statusId === status.id ? { ...ticket, statusId: moveToStatusId! } : ticket,
        ),
      );
    }
    setStatuses((prev) => prev.filter((s) => s.id !== status.id));
    toast.success(t("statusDeleted"));
  };

  const onDragStart = (event: DragStartEvent) => {
    const ticket = tickets.find((t) => t.id === event.active.id);
    if (ticket) setActiveTicket(ticket);
  };

  const onDragEnd = async (event: DragEndEvent) => {
    setActiveTicket(null);
    const { active, over } = event;
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    if (activeId.startsWith("status:") && overId.startsWith("status:")) {
      const fromId = activeId.replace("status:", "");
      const toId = overId.replace("status:", "");
      const oldIndex = statuses.findIndex((s) => s.id === fromId);
      const newIndex = statuses.findIndex((s) => s.id === toId);
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
      const next = arrayMove(statuses, oldIndex, newIndex);
      setStatuses(next);
      await fetch(`/api/sales-operation/tracker/projects/${projectId}/statuses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds: next.map((s) => s.id) }),
      });
      return;
    }

    if (activeId.startsWith("status:")) return;

    const ticket = tickets.find((t) => t.id === activeId);
    if (!ticket) return;

    let targetStatusId = ticket.statusId;
    let targetIndex = 0;

    if (overId.startsWith("status:")) {
      targetStatusId = overId.replace("status:", "");
      targetIndex = (ticketsByStatus.get(targetStatusId) ?? []).length;
    } else if (statuses.some((s) => s.id === overId)) {
      targetStatusId = overId;
      targetIndex = (ticketsByStatus.get(targetStatusId) ?? []).length;
    } else {
      const overTicket = tickets.find((t) => t.id === overId);
      if (!overTicket) return;
      targetStatusId = overTicket.statusId;
      const column = [...(ticketsByStatus.get(targetStatusId) ?? [])];
      targetIndex = column.findIndex((t) => t.id === overId);
      if (targetIndex < 0) targetIndex = column.length;
    }

    const destColumn = [...(ticketsByStatus.get(targetStatusId) ?? [])].filter(
      (t) => t.id !== ticket.id,
    );
    destColumn.splice(targetIndex, 0, { ...ticket, statusId: targetStatusId });

    const positionFor = (list: TrackerTicket[], index: number) => {
      const prev = list[index - 1]?.position;
      const next = list[index + 1]?.position;
      if (prev != null && next != null) return (prev + next) / 2;
      if (prev != null) return prev + 1000;
      if (next != null) return next - 1000;
      return 1000;
    };

    const newPosition = positionFor(destColumn, targetIndex);
    setTickets((prev) =>
      prev.map((t) =>
        t.id === ticket.id ? { ...t, statusId: targetStatusId, position: newPosition } : t,
      ),
    );

    const res = await fetch(`/api/sales-operation/tracker/tickets/${ticket.id}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ statusId: targetStatusId, position: newPosition }),
    });
    if (!res.ok) {
      toast.error("Move failed");
      void loadBoard(q);
    }
  };

  const onSearchChange = (value: string) => {
    setQ(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void loadBoard(value);
    }, 200);
  };

  if (loading && !project) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-10 w-64" />
        <div className="flex gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[420px] w-[300px] rounded-[16px]" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-[var(--so-border)] bg-[var(--so-surface)] px-4 py-3">
        <Link
          href="/sales-operation/tracker"
          className="inline-flex items-center gap-1 text-sm text-[var(--so-muted)] hover:text-[var(--so-text)]"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("backToProjects")}
        </Link>
        <h1 className="text-lg font-semibold text-[var(--so-text)]">{project?.name}</h1>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--so-muted-2)]" />
            <input
              ref={searchRef}
              value={q}
              onChange={(e) => onSearchChange(e.target.value)}
              onFocus={() => {
                composingRef.current = true;
              }}
              onBlur={() => {
                composingRef.current = false;
              }}
              placeholder={t("searchPlaceholder")}
              className="so-focus-ring h-9 w-48 rounded-[10px] border border-[var(--so-border)] bg-[var(--so-surface-2)] pl-8 pr-3 text-sm md:w-64"
            />
          </div>
          <select
            value={filterAssignee}
            onChange={(e) => setFilterAssignee(e.target.value)}
            className="so-focus-ring h-9 rounded-[10px] border border-[var(--so-border)] bg-[var(--so-surface-2)] px-2 text-sm"
          >
            <option value="">{t("assignee")}</option>
            {staff.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <select
            value={filterCreator}
            onChange={(e) => setFilterCreator(e.target.value)}
            className="so-focus-ring h-9 rounded-[10px] border border-[var(--so-border)] bg-[var(--so-surface-2)] px-2 text-sm"
          >
            <option value="">{t("creator")}</option>
            {staff.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
            className="so-focus-ring h-9 rounded-[10px] border border-[var(--so-border)] bg-[var(--so-surface-2)] px-2 text-sm"
          >
            <option value="">{t("priority")}</option>
            {TRACKER_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {t(`priority${p[0]!.toUpperCase()}${p.slice(1)}` as "priorityNormal")}
              </option>
            ))}
          </select>
          {(filterAssignee || filterPriority || filterCreator || q) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setFilterAssignee("");
                setFilterPriority("");
                setFilterCreator("");
                setQ("");
                void loadBoard("");
              }}
            >
              {t("clearFilters")}
            </Button>
          )}
          {canEditStatuses ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={async () => {
                const name = window.prompt(t("statusName"));
                if (!name?.trim()) return;
                const res = await fetch(
                  `/api/sales-operation/tracker/projects/${projectId}/statuses`,
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name: name.trim() }),
                  },
                );
                const data = (await res.json()) as {
                  ok?: boolean;
                  status?: TrackerStatus;
                  error?: string;
                };
                if (!res.ok || !data.ok || !data.status) {
                  toast.error(data.error ?? "Failed");
                  return;
                }
                setStatuses((prev) => [...prev, data.status!]);
              }}
            >
              <Plus className="h-4 w-4" />
              {t("addStatus")}
            </Button>
          ) : null}
        </div>
      </header>

      <div className="flex-1 overflow-x-auto overflow-y-hidden bg-[linear-gradient(180deg,var(--so-surface-2)_0%,transparent_120px)] p-4">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragEnd={(e) => void onDragEnd(e)}
        >
          <SortableContext
            items={statuses.map((s) => `status:${s.id}`)}
            strategy={horizontalListSortingStrategy}
          >
            <div className="flex h-full gap-3">
              {statuses.map((status) => (
                <StatusColumn
                  key={status.id}
                  status={status}
                  tickets={ticketsByStatus.get(status.id) ?? []}
                  subtaskCountByParent={subtaskCountByParent}
                  collapsed={Boolean(collapsed[status.id])}
                  otherStatuses={statuses.filter((s) => s.id !== status.id)}
                  onToggleCollapse={() =>
                    setCollapsed((prev) => ({ ...prev, [status.id]: !prev[status.id] }))
                  }
                  onOpenTicket={(id) => {
                    setOpenTicketId(id);
                    router.replace(`?ticket=${id}`, { scroll: false });
                  }}
                  onCreateTicket={createTicket}
                  onCopyTicketLink={(id) => void copyTicketLink(id)}
                  onDeleteTicket={(id) => void deleteTicket(id)}
                  onRenameStatus={(s) => void renameStatus(s)}
                  onRecolorStatus={(s, color) => void recolorStatus(s, color)}
                  onSetWip={(s) => void setWip(s)}
                  onDeleteStatus={(s) => void deleteStatus(s)}
                  canEditStatuses={canEditStatuses}
                />
              ))}
            </div>
          </SortableContext>
          <DragOverlay dropAnimation={dropAnimation}>
            {activeTicket ? (
              <div className="w-[280px] rotate-[1.5deg]">
                <TrackerTicketCard ticket={activeTicket} onOpen={() => undefined} isDragging />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {openTicketId ? (
        <TrackerTicketDrawer
          ticketId={openTicketId}
          projectId={projectId}
          projectLabels={labels}
          boardTickets={tickets}
          boardStatuses={statuses}
          onClose={() => {
            setOpenTicketId(null);
            router.replace("?", { scroll: false });
          }}
          onOpenTicket={(id) => {
            setOpenTicketId(id);
            router.replace(`?ticket=${id}`, { scroll: false });
          }}
          onChanged={() => void loadBoard(q)}
          onCreateSubtask={async (parentId, title, statusId) => {
            await createTicket(statusId, title, parentId);
            await loadBoard(q);
          }}
        />
      ) : null}
    </div>
  );
}
