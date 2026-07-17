"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
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
    const onClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

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
        className="relative flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50"
        aria-label={t("notifications.title")}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[0.6rem] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          className={`crm-surface absolute z-30 mt-2 max-h-[26rem] w-80 overflow-y-auto rounded-2xl p-2 ${
            language === "he" ? "left-0" : "right-0"
          }`}
        >
          <div className="flex items-center justify-between px-2 py-1.5">
            <p className="text-sm font-semibold text-slate-900">{t("notifications.title")}</p>
            {unread > 0 ? (
              <button
                type="button"
                onClick={() => void onMarkAll()}
                className="text-xs font-semibold text-red-700 hover:underline"
              >
                {t("notifications.markAllRead")}
              </button>
            ) : null}
          </div>
          {items.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-muted">{t("notifications.empty")}</p>
          ) : (
            <ul className="space-y-1">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => void onItemClick(item)}
                    className={`w-full rounded-xl px-2.5 py-2 text-left transition hover:bg-slate-50 ${
                      item.isRead ? "" : "bg-red-50/60"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-semibold text-slate-900">{item.title}</p>
                      <span className="shrink-0 text-[0.65rem] text-muted">
                        {timeAgo(item.createdAt)}
                      </span>
                    </div>
                    {item.body ? (
                      <p className="mt-0.5 line-clamp-2 text-[0.7rem] text-slate-500">{item.body}</p>
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
