"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import type { SalesNotification } from "@/lib/sales-operation/types";

const POLL_INTERVAL_MS = 60_000;

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diff = Math.max(0, Date.now() - then);
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function SalesNotificationsBell() {
  const t = useTranslations("salesOperation");
  const router = useRouter();
  const { language } = useAuth();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<SalesNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/sales-operation/notifications?limit=15", {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        ok?: boolean;
        notifications?: SalesNotification[];
        unreadCount?: number;
      };
      if (data.ok) {
        setItems(data.notifications ?? []);
        setUnread(data.unreadCount ?? 0);
      }
    } catch {
      // best-effort; ignore transient errors
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    void load();
    const onClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open, load]);

  const markRead = useCallback(async (ids?: string[], all?: boolean) => {
    try {
      await fetch("/api/sales-operation/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(all ? { all: true } : { ids }),
      });
    } catch {
      // ignore
    }
  }, []);

  const onItemClick = async (item: SalesNotification) => {
    setOpen(false);
    if (!item.isRead) {
      setItems((prev) =>
        prev.map((row) => (row.id === item.id ? { ...row, isRead: true } : row)),
      );
      setUnread((prev) => Math.max(0, prev - 1));
      await markRead([item.id]);
    }
    if (item.link) router.push(item.link);
  };

  const onMarkAll = async () => {
    setItems((prev) => prev.map((row) => ({ ...row, isRead: true })));
    setUnread(0);
    await markRead(undefined, true);
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="so-focus-ring relative flex h-9 w-9 items-center justify-center rounded-[10px] border border-[var(--so-border-strong)] bg-[var(--so-surface)] text-[var(--so-muted)] transition-colors hover:bg-[var(--so-surface-hover)] hover:text-[var(--so-text)]"
        aria-label={t("notifications.title")}
      >
        <Bell className="h-[18px] w-[18px]" />
        {unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--so-accent)] px-1 text-[0.6rem] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          className={`absolute z-30 mt-2 max-h-[26rem] w-80 overflow-y-auto rounded-[14px] border border-[var(--so-border)] bg-[var(--so-surface)] p-2 shadow-[var(--so-shadow-lg)] ${
            language === "he" ? "left-0" : "right-0"
          }`}
        >
          <div className="flex items-center justify-between px-2 py-1.5">
            <p className="text-sm font-semibold text-[var(--so-text)]">{t("notifications.title")}</p>
            {unread > 0 ? (
              <button
                type="button"
                onClick={() => void onMarkAll()}
                className="text-xs font-semibold text-[var(--so-accent-strong)] hover:underline"
              >
                {t("notifications.markAllRead")}
              </button>
            ) : null}
          </div>
          {items.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-[var(--so-muted)]">{t("notifications.empty")}</p>
          ) : (
            <ul className="space-y-0.5">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => void onItemClick(item)}
                    className={`so-focus-ring w-full rounded-[10px] px-2.5 py-2 text-left transition-colors hover:bg-[var(--so-surface-hover)] ${
                      item.isRead ? "" : "bg-[var(--so-accent-soft)]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        {item.type === "mention" ? (
                          <span className="mb-0.5 inline-flex rounded-md bg-[var(--so-accent)] px-1.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide text-white">
                            @mention
                          </span>
                        ) : null}
                        <p className="text-xs font-semibold text-[var(--so-text)]">{item.title}</p>
                      </div>
                      <span className="shrink-0 text-[0.65rem] text-[var(--so-muted-2)]">
                        {timeAgo(item.createdAt)}
                      </span>
                    </div>
                    {item.body ? (
                      <p className="mt-0.5 line-clamp-2 text-[0.7rem] text-[var(--so-muted)]">{item.body}</p>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
