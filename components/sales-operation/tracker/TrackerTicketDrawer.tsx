"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import {
  Archive,
  Copy,
  GitBranch,
  Link2,
  Paperclip,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { getPlatformStaffUserOptions } from "@/lib/sales-operation/crm-manager-users";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/ui/cn";
import {
  TRACKER_LINK_TYPES,
  TRACKER_PRIORITIES,
  type TrackerLabel,
  type TrackerLinkType,
  type TrackerStatus,
  type TrackerTicket,
  type TrackerTicketDetail,
} from "@/lib/sales-operation/tracker-types";
import {
  HighlightedCommentBody,
  MentionCommentComposer,
} from "@/components/sales-operation/tracker/MentionCommentComposer";

function simpleMarkdown(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/\n/g, "<br/>");
}

export function TrackerTicketDrawer({
  ticketId,
  projectId,
  projectLabels,
  boardTickets,
  boardStatuses,
  onClose,
  onOpenTicket,
  onChanged,
  onCreateSubtask,
}: {
  ticketId: string | null;
  projectId: string;
  projectLabels: TrackerLabel[];
  boardTickets: TrackerTicket[];
  boardStatuses: TrackerStatus[];
  onClose: () => void;
  onOpenTicket: (id: string) => void;
  onChanged: () => void;
  onCreateSubtask: (parentId: string, title: string, statusId: string) => Promise<void>;
}) {
  const t = useTranslations("salesOperation.tracker");
  const toast = useToast();
  const confirm = useConfirm();
  const { users } = useAuth();
  const staff = useMemo(() => getPlatformStaffUserOptions(users), [users]);

  const [ticket, setTicket] = useState<TrackerTicketDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [descMode, setDescMode] = useState<"write" | "preview">("write");
  const [priority, setPriority] = useState("normal");
  const [dueAt, setDueAt] = useState("");
  const [comment, setComment] = useState("");
  const [checklistTitle, setChecklistTitle] = useState("");
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [linkQuery, setLinkQuery] = useState("");
  const [linkType, setLinkType] = useState<TrackerLinkType>("related");
  const [linkPickerOpen, setLinkPickerOpen] = useState(false);
  const [newLabelName, setNewLabelName] = useState("");

  const load = useCallback(async () => {
    if (!ticketId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/sales-operation/tracker/tickets/${ticketId}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as {
        ok?: boolean;
        ticket?: TrackerTicketDetail;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.ticket) {
        toast.error(data.error ?? "Failed to load ticket");
        return;
      }
      setTicket(data.ticket);
      setTitle(data.ticket.title);
      setDescription(data.ticket.description ?? "");
      setPriority(data.ticket.priority);
      setDueAt(data.ticket.dueAt ? data.ticket.dueAt.slice(0, 16) : "");
    } finally {
      setLoading(false);
    }
  }, [ticketId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const linkCandidates = useMemo(() => {
    const q = linkQuery.trim().toLowerCase();
    return boardTickets
      .filter((item) => item.id !== ticketId)
      .filter((item) => !q || item.title.toLowerCase().includes(q))
      .slice(0, 12);
  }, [boardTickets, linkQuery, ticketId]);

  if (!ticketId) return null;

  const save = async () => {
    const res = await fetch(`/api/sales-operation/tracker/tickets/${ticketId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        description: description || null,
        priority,
        dueAt: dueAt ? new Date(dueAt).toISOString() : null,
      }),
    });
    const data = (await res.json()) as { ok?: boolean; ticket?: TrackerTicketDetail; error?: string };
    if (!res.ok || !data.ok || !data.ticket) {
      toast.error(data.error ?? "Failed to save");
      return;
    }
    setTicket(data.ticket);
    onChanged();
    toast.success(t("save"));
  };

  const setAssignees = async (userIds: string[]) => {
    if (!ticket) return;
    const previous = ticket.assignees;
    const assignees = userIds.map((id) => {
      const u = staff.find((s) => s.id === id);
      return { userId: id, userName: u?.name ?? null };
    });
    // Optimistic: flip chips immediately, sync in background.
    setTicket({ ...ticket, assignees });
    try {
      const res = await fetch(`/api/sales-operation/tracker/tickets/${ticketId}/assignees`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignees }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setTicket((prev) => (prev ? { ...prev, assignees: previous } : prev));
        toast.error(data.error ?? "Failed to assign");
        return;
      }
      onChanged();
    } catch {
      setTicket((prev) => (prev ? { ...prev, assignees: previous } : prev));
      toast.error("Failed to assign");
    }
  };

  const setLabels = async (labelIds: string[]) => {
    await fetch(`/api/sales-operation/tracker/tickets/${ticketId}/labels`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ labelIds }),
    });
    await load();
    onChanged();
  };

  const addLink = async (toTicketId: string) => {
    const res = await fetch(`/api/sales-operation/tracker/tickets/${ticketId}/links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toTicketId, linkType }),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) {
      toast.error(data.error ?? "Failed to link");
      return;
    }
    setLinkQuery("");
    setLinkPickerOpen(false);
    await load();
    toast.success(t("linkAdded"));
  };

  const removeLink = async (linkId: string) => {
    const res = await fetch(`/api/sales-operation/tracker/tickets/${ticketId}/links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deleteLinkId: linkId }),
    });
    if (!res.ok) {
      toast.error("Failed to remove link");
      return;
    }
    await load();
  };

  return (
    <div className="fixed inset-0 z-[90] flex justify-end">
      <motion.button
        type="button"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="absolute inset-0 bg-black/35 backdrop-blur-[1px]"
        aria-label="Close"
        onClick={onClose}
      />
      <motion.aside
        initial={{ x: 40, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 380, damping: 34 }}
        className="relative z-[91] flex h-full w-full max-w-xl flex-col border-l border-[var(--so-border)] bg-[var(--so-surface)] shadow-[var(--so-shadow-lg)]"
      >
        <header className="flex items-center justify-between gap-2 border-b border-[var(--so-border)] px-4 py-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--so-muted)]">
              {boardStatuses.find((s) => s.id === ticket?.statusId)?.name ?? t("status")}
            </p>
            <h2 className="truncate text-base font-semibold text-[var(--so-text)]">
              {loading ? "…" : ticket?.title}
            </h2>
          </div>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              title={t("copyLink")}
              onClick={async () => {
                const url = `${window.location.origin}/sales-operation/tracker/${projectId}?ticket=${ticketId}`;
                try {
                  await navigator.clipboard.writeText(url);
                  toast.success(t("linkCopied"));
                } catch {
                  toast.error(t("linkCopyFailed"));
                }
              }}
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              title={ticket?.archivedAt ? t("unarchive") : t("archive")}
              onClick={async () => {
                const archived = !ticket?.archivedAt;
                const res = await fetch(`/api/sales-operation/tracker/tickets/${ticketId}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ archived }),
                });
                const data = (await res.json()) as { ok?: boolean; error?: string };
                if (!res.ok) {
                  toast.error(data.error ?? "Failed");
                  return;
                }
                toast.success(archived ? t("archive") : t("unarchive"));
                await load();
                onChanged();
              }}
            >
              <Archive className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              title={t("delete")}
              onClick={async () => {
                const ok = await confirm({
                  title: t("delete"),
                  description: t("deleteConfirm"),
                  confirmLabel: t("delete"),
                  destructive: true,
                });
                if (!ok) return;
                const res = await fetch(`/api/sales-operation/tracker/tickets/${ticketId}`, {
                  method: "DELETE",
                });
                const data = (await res.json()) as { ok?: boolean; error?: string };
                if (!res.ok || !data.ok) {
                  toast.error(data.error ?? "Failed to delete");
                  return;
                }
                toast.success(t("deleted"));
                onChanged();
                onClose();
              }}
            >
              <Trash2 className="h-4 w-4 text-rose-600" />
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-[var(--so-muted)]">Title</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="so-focus-ring h-10 w-full rounded-[10px] border border-[var(--so-border)] bg-[var(--so-surface-2)] px-3 text-sm"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-xs font-medium text-[var(--so-muted)]">{t("priority")}</span>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="so-focus-ring h-10 w-full rounded-[10px] border border-[var(--so-border)] bg-[var(--so-surface-2)] px-3 text-sm"
              >
                {TRACKER_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {t(`priority${p[0]!.toUpperCase()}${p.slice(1)}` as "priorityNormal")}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-[var(--so-muted)]">{t("dueDate")}</span>
              <input
                type="datetime-local"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                className="so-focus-ring h-10 w-full rounded-[10px] border border-[var(--so-border)] bg-[var(--so-surface-2)] px-3 text-sm"
              />
            </label>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[var(--so-muted)]">{t("description")}</span>
              <div className="flex gap-1 text-xs">
                <button
                  type="button"
                  className={cn(descMode === "write" && "font-semibold text-[var(--so-accent)]")}
                  onClick={() => setDescMode("write")}
                >
                  {t("write")}
                </button>
                <span>/</span>
                <button
                  type="button"
                  className={cn(descMode === "preview" && "font-semibold text-[var(--so-accent)]")}
                  onClick={() => setDescMode("preview")}
                >
                  {t("preview")}
                </button>
              </div>
            </div>
            {descMode === "write" ? (
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
                placeholder={t("markdownHint")}
                className="so-focus-ring w-full rounded-[10px] border border-[var(--so-border)] bg-[var(--so-surface-2)] px-3 py-2 text-sm"
              />
            ) : (
              <div
                className="prose prose-sm min-h-[100px] rounded-[10px] border border-[var(--so-border)] bg-[var(--so-surface-2)] px-3 py-2"
                dangerouslySetInnerHTML={{ __html: simpleMarkdown(description || "") }}
              />
            )}
          </div>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--so-muted)]">
              {t("assignees")}
            </h3>
            <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto">
              {staff.map((u) => {
                const checked = ticket?.assignees.some((a) => a.userId === u.id) ?? false;
                return (
                  <button
                    key={u.id}
                    type="button"
                    aria-pressed={checked}
                    onClick={() => {
                      const current = new Set(ticket?.assignees.map((a) => a.userId) ?? []);
                      if (checked) current.delete(u.id);
                      else current.add(u.id);
                      void setAssignees(Array.from(current));
                    }}
                    className={cn(
                      "so-focus-ring inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-medium",
                      "transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out",
                      "hover:-translate-y-px active:translate-y-0 active:scale-[0.97]",
                      checked
                        ? "border-[var(--so-accent)] bg-[var(--so-accent)] text-white shadow-[0_0_0_3px_rgba(255,45,45,0.14)] hover:bg-[var(--so-accent-strong)] hover:shadow-[0_0_0_3px_rgba(255,45,45,0.22)]"
                        : "border-[var(--so-border)] bg-[var(--so-surface)] text-[var(--so-muted)] hover:border-[var(--so-border-strong)] hover:bg-[var(--so-surface-hover)] hover:text-[var(--so-text)] hover:shadow-[var(--so-shadow-xs)]",
                    )}
                  >
                    <span
                      className={cn(
                        "inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold",
                        checked ? "bg-white/20 text-white" : "bg-[var(--so-surface-2)] text-[var(--so-muted)]",
                      )}
                    >
                      {u.name.slice(0, 1).toUpperCase()}
                    </span>
                    {u.name}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--so-muted)]">
              {t("labels")}
            </h3>
            <div className="flex flex-wrap gap-1">
              {projectLabels.map((label) => {
                const checked = ticket?.labels.some((l) => l.id === label.id) ?? false;
                return (
                  <button
                    key={label.id}
                    type="button"
                    onClick={() => {
                      const current = new Set(ticket?.labels.map((l) => l.id) ?? []);
                      if (checked) current.delete(label.id);
                      else current.add(label.id);
                      void setLabels(Array.from(current));
                    }}
                    className={cn(
                      "rounded-md px-2 py-0.5 text-xs font-medium text-white transition",
                      !checked && "opacity-35",
                    )}
                    style={{ backgroundColor: label.color }}
                  >
                    {label.name}
                  </button>
                );
              })}
            </div>
            <form
              className="flex gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!newLabelName.trim()) return;
                const res = await fetch(
                  `/api/sales-operation/tracker/projects/${projectId}/labels`,
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name: newLabelName.trim() }),
                  },
                );
                const data = (await res.json()) as {
                  ok?: boolean;
                  label?: TrackerLabel;
                  error?: string;
                };
                if (!res.ok || !data.ok || !data.label) {
                  toast.error(data.error ?? "Failed to create label");
                  return;
                }
                setNewLabelName("");
                onChanged();
                await setLabels([...(ticket?.labels.map((l) => l.id) ?? []), data.label.id]);
              }}
            >
              <input
                value={newLabelName}
                onChange={(e) => setNewLabelName(e.target.value)}
                placeholder={t("newLabel")}
                className="so-focus-ring h-8 flex-1 rounded-[8px] border border-[var(--so-border)] bg-[var(--so-surface-2)] px-2 text-xs"
              />
              <Button type="submit" size="sm" variant="secondary">
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </form>
          </section>

          <section className="space-y-2">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--so-muted)]">
              <GitBranch className="h-3.5 w-3.5" />
              {t("subtasks")}
            </h3>
            <ul className="space-y-1">
              {ticket?.subtasks.map((st) => (
                <li key={st.id}>
                  <button
                    type="button"
                    className="w-full rounded-[10px] border border-[var(--so-border)] bg-[var(--so-surface-2)] px-3 py-2 text-left text-sm hover:border-[var(--so-accent)]"
                    onClick={() => onOpenTicket(st.id)}
                  >
                    {st.title}
                  </button>
                </li>
              ))}
            </ul>
            <form
              className="flex gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!subtaskTitle.trim() || !ticket) return;
                await onCreateSubtask(ticket.id, subtaskTitle.trim(), ticket.statusId);
                setSubtaskTitle("");
                await load();
              }}
            >
              <input
                value={subtaskTitle}
                onChange={(e) => setSubtaskTitle(e.target.value)}
                placeholder={t("addSubtask")}
                className="so-focus-ring h-9 flex-1 rounded-[10px] border border-[var(--so-border)] bg-[var(--so-surface-2)] px-3 text-sm"
              />
              <Button type="submit" size="sm" disabled={!subtaskTitle.trim()}>
                <Plus className="h-4 w-4" />
              </Button>
            </form>
          </section>

          <section className="space-y-2">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--so-muted)]">
              <Link2 className="h-3.5 w-3.5" />
              {t("linkedTickets")}
            </h3>
            <ul className="space-y-1">
              {ticket?.links.map((link) => (
                <li
                  key={link.id}
                  className="flex items-center justify-between gap-2 rounded-[10px] border border-[var(--so-border)] bg-[var(--so-surface-2)] px-3 py-2 text-sm"
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => onOpenTicket(link.toTicketId)}
                  >
                    <span className="mr-2 rounded bg-[var(--so-surface)] px-1.5 py-0.5 text-[10px] font-semibold uppercase text-[var(--so-muted)]">
                      {link.linkType}
                    </span>
                    <span className="text-[var(--so-accent)] hover:underline">
                      {link.toTicketTitle ?? link.toTicketId}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="text-[var(--so-muted)] hover:text-rose-600"
                    onClick={() => void removeLink(link.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
            <div className="space-y-2 rounded-[12px] border border-dashed border-[var(--so-border)] p-2.5">
              <select
                value={linkType}
                onChange={(e) => setLinkType(e.target.value as TrackerLinkType)}
                className="so-focus-ring h-9 w-full rounded-[10px] border border-[var(--so-border)] bg-[var(--so-surface-2)] px-2 text-sm"
              >
                {TRACKER_LINK_TYPES.map((lt) => (
                  <option key={lt} value={lt}>
                    {t(`link.${lt}` as "link.related")}
                  </option>
                ))}
              </select>
              <div className="relative">
                <input
                  value={linkQuery}
                  onChange={(e) => {
                    setLinkQuery(e.target.value);
                    setLinkPickerOpen(true);
                  }}
                  onFocus={() => setLinkPickerOpen(true)}
                  placeholder={t("searchTicketToLink")}
                  className="so-focus-ring h-9 w-full rounded-[10px] border border-[var(--so-border)] bg-[var(--so-surface-2)] px-3 text-sm"
                />
                {linkPickerOpen && linkCandidates.length > 0 ? (
                  <div className="absolute left-0 right-0 top-10 z-10 max-h-48 overflow-y-auto rounded-[12px] border border-[var(--so-border)] bg-[var(--so-surface)] p-1 shadow-[var(--so-shadow-md)]">
                    {linkCandidates.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="flex w-full rounded-[8px] px-2.5 py-1.5 text-left text-sm hover:bg-[var(--so-surface-2)]"
                        onClick={() => void addLink(item.id)}
                      >
                        {item.title}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--so-muted)]">
              {t("checklist")}
            </h3>
            <ul className="space-y-1">
              {ticket?.checklist.map((item) => (
                <li key={item.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={item.done}
                    onChange={async () => {
                      await fetch(`/api/sales-operation/tracker/tickets/${ticketId}/checklist`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ itemId: item.id, done: !item.done }),
                      });
                      await load();
                      onChanged();
                    }}
                  />
                  <span className={cn(item.done && "line-through text-[var(--so-muted)]")}>
                    {item.title}
                  </span>
                </li>
              ))}
            </ul>
            <input
              value={checklistTitle}
              onChange={(e) => setChecklistTitle(e.target.value)}
              className="so-focus-ring h-9 w-full rounded-[10px] border border-[var(--so-border)] bg-[var(--so-surface-2)] px-3 text-sm"
              placeholder={t("addChecklist")}
              onKeyDown={async (e) => {
                if (e.key !== "Enter" || !checklistTitle.trim()) return;
                await fetch(`/api/sales-operation/tracker/tickets/${ticketId}/checklist`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ title: checklistTitle }),
                });
                setChecklistTitle("");
                await load();
                onChanged();
              }}
            />
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--so-muted)]">
              {t("comments")}
            </h3>
            <div className="space-y-2">
              {ticket?.comments.map((c) => (
                <div
                  key={c.id}
                  className="rounded-[12px] border border-[var(--so-border)] border-l-[3px] border-l-[var(--so-accent)] bg-[var(--so-surface-2)] px-3 py-2.5 text-sm shadow-[var(--so-shadow-xs)]"
                >
                  <div className="mb-1.5 flex items-center justify-between gap-2 text-xs text-[var(--so-muted)]">
                    <span className="font-semibold text-[var(--so-text)]">{c.authorName ?? "User"}</span>
                    <span>{new Date(c.createdAt).toLocaleString()}</span>
                  </div>
                  <HighlightedCommentBody body={c.body} staff={staff} className="text-[var(--so-text)]" />
                </div>
              ))}
            </div>
            <MentionCommentComposer
              value={comment}
              onChange={setComment}
              staff={staff}
              placeholder={t("addCommentHint")}
              rows={3}
            />
            <Button
              type="button"
              size="sm"
              disabled={!comment.trim()}
              onClick={async () => {
                const res = await fetch(
                  `/api/sales-operation/tracker/tickets/${ticketId}/comments`,
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ body: comment }),
                  },
                );
                if (res.ok) {
                  setComment("");
                  await load();
                  onChanged();
                } else {
                  const data = (await res.json()) as { error?: string };
                  toast.error(data.error ?? "Failed to comment");
                }
              }}
            >
              {t("addComment")}
            </Button>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--so-muted)]">
              {t("attachments")}
            </h3>
            <ul className="space-y-1 text-sm">
              {ticket?.files.map((f) => (
                <li key={f.id}>
                  <a
                    href={f.downloadUrl ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[var(--so-accent)] hover:underline"
                  >
                    <Paperclip className="h-3 w-3" />
                    {f.fileName}
                  </a>
                </li>
              ))}
            </ul>
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-[var(--so-accent)]">
              <input
                type="file"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const form = new FormData();
                  form.append("file", file);
                  await fetch(`/api/sales-operation/tracker/tickets/${ticketId}/files`, {
                    method: "POST",
                    body: form,
                  });
                  await load();
                  e.target.value = "";
                }}
              />
              {t("uploadFile")}
            </label>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--so-muted)]">
              {t("activity")}
            </h3>
            <ul className="space-y-2 text-xs text-[var(--so-muted)]">
              {ticket?.activity.map((a) => (
                <li key={a.id}>
                  <span className="font-medium text-[var(--so-text)]">{a.actorName ?? "System"}</span>{" "}
                  · {a.eventType} · {new Date(a.createdAt).toLocaleString()}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <footer className="border-t border-[var(--so-border)] px-4 py-3">
          <Button type="button" className="w-full" onClick={() => void save()}>
            {t("save")}
          </Button>
        </footer>
      </motion.aside>
    </div>
  );
}
