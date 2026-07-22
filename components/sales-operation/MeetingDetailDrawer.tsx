"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ExternalLink, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Dialog";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { formatSalesDateTime } from "@/lib/sales-operation/display";
import type { SalesMeeting } from "@/lib/sales-operation/meetings";

function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function stampNote(existing: string, note: string): string {
  const stamp = new Date().toLocaleString();
  const block = `[${stamp}]\n${note.trim()}`;
  return existing.trim() ? `${existing.trim()}\n\n${block}` : block;
}

export function MeetingDetailDrawer({
  open,
  onOpenChange,
  meeting,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meeting: SalesMeeting | null;
  onChanged?: () => void;
}) {
  const t = useTranslations("salesOperation");
  const toast = useToast();
  const confirm = useConfirm();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [quickNote, setQuickNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!meeting || !open) return;
    setTitle(meeting.title);
    setDescription(meeting.description ?? "");
    setStartsAt(toLocalInput(meeting.startsAt));
    setEndsAt(toLocalInput(meeting.endsAt));
    setQuickNote("");
  }, [meeting, open]);

  const save = async () => {
    if (!meeting || !title.trim() || !startsAt || !endsAt) return;
    setSaving(true);
    try {
      const res = await fetch("/api/sales-operation/meetings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: meeting.id,
          title: title.trim(),
          description: description.trim() || "",
          startsAt: new Date(startsAt).toISOString(),
          endsAt: new Date(endsAt).toISOString(),
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed to save meeting.");
      toast.success(t("calendar.meetingSaved"));
      onChanged?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("calendar.meetingSaveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const addNote = () => {
    if (!quickNote.trim()) return;
    setDescription((prev) => stampNote(prev, quickNote));
    setQuickNote("");
  };

  const remove = async () => {
    if (!meeting) return;
    const ok = await confirm({
      title: t("calendar.deleteMeetingTitle"),
      description: t("calendar.deleteMeetingConfirm"),
      confirmLabel: t("calendar.deleteMeeting"),
      destructive: true,
    });
    if (!ok) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/sales-operation/meetings?id=${encodeURIComponent(meeting.id)}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed to delete meeting.");
      toast.success(t("calendar.meetingDeleted"));
      onChanged?.();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("calendar.meetingDeleteFailed"));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={title || t("calendar.meetingTitle")}
      description={
        meeting
          ? [
              t("calendar.legendMeeting"),
              meeting.startsAt ? formatSalesDateTime(meeting.startsAt) : null,
              meeting.googleEventId ? t("calendar.syncedWithGoogle") : null,
            ]
              .filter(Boolean)
              .join(" · ") || undefined
          : undefined
      }
      width="32rem"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <Button
            variant="secondary"
            loading={deleting}
            disabled={deleting || saving}
            leftIcon={<Trash2 className="h-4 w-4" />}
            onClick={() => void remove()}
          >
            {t("calendar.deleteMeeting")}
          </Button>
          <Button
            loading={saving}
            disabled={saving || deleting || !title.trim() || !startsAt || !endsAt}
            onClick={() => void save()}
          >
            {t("task.save")}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 px-5 py-4">
        {meeting?.clientId ? (
          <Link
            href={`/sales-operation/b2b-clients/${meeting.clientId}`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--so-accent-strong)] hover:underline"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {t("calendar.openClient")}
          </Link>
        ) : null}

        <label className="block text-sm">
          <span className="crm-label">{t("calendar.meetingTitle")}</span>
          <input
            className="crm-input mt-1 h-10 w-full px-3 text-sm"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="crm-label">{t("calendar.startsAt")}</span>
            <input
              type="datetime-local"
              className="crm-input mt-1 h-10 w-full px-3 text-sm"
              value={startsAt}
              onChange={(event) => setStartsAt(event.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="crm-label">{t("calendar.endsAt")}</span>
            <input
              type="datetime-local"
              className="crm-input mt-1 h-10 w-full px-3 text-sm"
              value={endsAt}
              onChange={(event) => setEndsAt(event.target.value)}
            />
          </label>
        </div>

        <label className="block text-sm">
          <span className="crm-label">{t("calendar.notes")}</span>
          <textarea
            className="crm-input mt-1 min-h-[120px] w-full px-3 py-2 text-sm"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={t("calendar.notesPlaceholder")}
          />
        </label>

        <div className="rounded-[12px] border border-[var(--so-border)] bg-[var(--so-surface-2)] p-3">
          <p className="mb-2 text-xs font-semibold text-[var(--so-muted)]">
            {t("calendar.addNote")}
          </p>
          <textarea
            className="crm-input min-h-[72px] w-full px-3 py-2 text-sm"
            value={quickNote}
            onChange={(event) => setQuickNote(event.target.value)}
            placeholder={t("calendar.addNotePlaceholder")}
          />
          <div className="mt-2 flex justify-end">
            <Button
              size="sm"
              variant="secondary"
              disabled={!quickNote.trim()}
              onClick={addNote}
            >
              {t("calendar.appendNote")}
            </Button>
          </div>
        </div>

        {meeting ? (
          <p className="text-xs text-[var(--so-muted-2)]">
            {t("calendar.updatedAt")}: {formatSalesDateTime(meeting.updatedAt)}
          </p>
        ) : null}
      </div>
    </Drawer>
  );
}
