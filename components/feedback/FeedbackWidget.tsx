"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { MessageSquarePlus } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Dialog";
import { cn } from "@/lib/ui/cn";
import type { FeedbackRequest } from "@/lib/feedback/types";
import { feedbackStatusLabel } from "@/lib/feedback/types";

const HIDDEN_PREFIXES = ["/login", "/unsubscribe"];

export function FeedbackWidget() {
  const { currentUser } = useAuth();
  const pathname = usePathname() || "/";
  const hidden = HIDDEN_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [unseenCount, setUnseenCount] = useState(0);
  const [recentUpdates, setRecentUpdates] = useState<FeedbackRequest[]>([]);

  const loadMine = useCallback(async () => {
    if (!currentUser || hidden) return;
    try {
      const res = await fetch("/api/feedback", { cache: "no-store" });
      const data = (await res.json()) as {
        ok?: boolean;
        items?: FeedbackRequest[];
        unseenStatusCount?: number;
      };
      if (!res.ok || !data.ok) return;
      setUnseenCount(data.unseenStatusCount ?? 0);
      const updates = (data.items ?? []).filter((item) => {
        if (!item.statusChangedAt) return false;
        if (!item.statusNotifiedAt) return true;
        return item.statusNotifiedAt < item.statusChangedAt;
      });
      setRecentUpdates(updates);
    } catch {
      /* ignore poll errors */
    }
  }, [currentUser, hidden]);

  useEffect(() => {
    void loadMine();
    if (!currentUser || hidden) return;
    const timer = window.setInterval(() => void loadMine(), 60_000);
    return () => window.clearInterval(timer);
  }, [currentUser, hidden, loadMine]);

  if (!currentUser || hidden) return null;

  const submit = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, pathname }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed to send feedback.");
      setTitle("");
      setDescription("");
      setSuccess("Thanks — your feedback was sent.");
      window.setTimeout(() => {
        setOpen(false);
        setSuccess(null);
      }, 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send feedback.");
    } finally {
      setSaving(false);
    }
  };

  const acknowledgeUpdates = async () => {
    if (recentUpdates.length === 0) return;
    const ids = recentUpdates.map((item) => item.id);
    setUnseenCount(0);
    setRecentUpdates([]);
    try {
      await fetch("/api/feedback/seen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
    } catch {
      /* ignore */
    }
  };

  return (
    <>
      <button
        type="button"
        aria-label="Send feedback"
        onClick={() => {
          setOpen(true);
          setError(null);
          setSuccess(null);
          void acknowledgeUpdates();
        }}
        className={cn(
          "fixed bottom-20 right-5 z-[130] inline-flex h-14 w-14 items-center justify-center rounded-full",
          "bg-[var(--so-accent,#FF2D2D)] text-white shadow-[0_10px_30px_rgba(255,45,45,0.35)]",
          "transition-transform hover:scale-105 hover:bg-[var(--so-accent-strong,#C70F1F)]",
          "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,45,45,0.25)]",
        )}
      >
        <MessageSquarePlus className="h-6 w-6" strokeWidth={2.25} />
        {unseenCount > 0 ? (
          <span className="absolute -right-1 -top-1 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-[var(--so-text,#14161A)] px-1.5 py-0.5 text-[10px] font-bold text-white">
            {unseenCount > 9 ? "9+" : unseenCount}
          </span>
        ) : null}
      </button>

      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Send feedback"
        description="Tell us what to change, add, remove, or improve."
        className="max-w-md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              loading={saving}
              disabled={saving || !title.trim() || !description.trim()}
              onClick={() => void submit()}
            >
              Send
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {recentUpdates.length > 0 ? (
            <div className="rounded-[12px] border border-[var(--so-border,#E9EBF0)] bg-[var(--so-surface-2,#F5F6F8)] p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-[var(--so-muted,#6B7280)]">
                Status updates
              </p>
              <ul className="mt-2 space-y-1.5">
                {recentUpdates.slice(0, 5).map((item) => (
                  <li key={item.id} className="text-sm text-[var(--so-text,#14161A)]">
                    <span className="font-semibold">{feedbackStatusLabel(item.status)}</span>
                    {" · "}
                    {item.title}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <label className="block text-sm">
            <span className="crm-label">Title</span>
            <input
              className="crm-input mt-1 h-10 w-full px-3 text-sm"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Short summary"
              maxLength={200}
              autoFocus
            />
          </label>

          <label className="block text-sm">
            <span className="crm-label">Description</span>
            <textarea
              className="crm-input mt-1 min-h-[140px] w-full px-3 py-2 text-sm"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Пожалуйста обьясни в каком разделе нужны изменения, либо что хочешь добавить, убрать, доработать"
              maxLength={4000}
            />
          </label>

          {error ? <p className="text-xs text-rose-600">{error}</p> : null}
          {success ? <p className="text-xs font-semibold text-emerald-700">{success}</p> : null}
        </div>
      </Modal>
    </>
  );
}
