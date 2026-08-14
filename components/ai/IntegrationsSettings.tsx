"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";

type TelegramStatus = {
  configured: boolean;
  connected: boolean;
  username: string | null;
  chatId: string | null;
  linkedAt: string | null;
  pendingCode: string | null;
  botUsername: string | null;
};

type Integrations = {
  googleCalendar: { configured: boolean; connected: boolean; connectUrl: string };
  gmail: { configured: boolean; connected: boolean; email: string | null; connectUrl: string };
  telegram: TelegramStatus;
  smtp: { configured: boolean };
};

const POLL_MS = 3000;
const POLL_TIMEOUT_MS = 180000;

export function IntegrationsSettings() {
  const t = useTranslations("salesOperation.ai");
  const [data, setData] = useState<Integrations | null>(null);
  const [telegramCode, setTelegramCode] = useState<string | null>(null);
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/ai/integrations", { cache: "no-store" });
    const json = (await res.json()) as { ok?: boolean; error?: string } & Partial<Integrations>;
    if (!res.ok || !json.ok) {
      setError(json.error ?? t("integrationsLoadError"));
      return null;
    }
    const next = json as Integrations;
    setData(next);
    return next;
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const telegram = data?.telegram;

  // Linking happens inside Telegram, so the page has to poll to notice it.
  useEffect(() => {
    if (!waiting) return;
    const startedAt = Date.now();
    const timer = setInterval(() => {
      void load().then((next) => {
        if (next?.telegram?.connected || Date.now() - startedAt > POLL_TIMEOUT_MS) {
          setWaiting(false);
        }
      });
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [waiting, load]);

  const linkTelegram = async () => {
    setError(null);
    const res = await fetch("/api/ai/integrations/telegram", { method: "POST" });
    const json = (await res.json()) as {
      ok?: boolean;
      code?: string;
      deepLink?: string | null;
      error?: string;
    };
    if (!json.ok || !json.code) {
      setError(json.error ?? t("integrationsLoadError"));
      return;
    }
    setTelegramCode(json.code);
    setDeepLink(json.deepLink ?? null);
    setWaiting(true);
    await load();
  };

  const checkNow = async () => {
    setChecking(true);
    const next = await load();
    if (next?.telegram?.connected) setWaiting(false);
    setChecking(false);
  };

  const unlinkTelegram = async () => {
    await fetch("/api/ai/integrations?provider=telegram", { method: "DELETE" });
    setTelegramCode(null);
    setDeepLink(null);
    setWaiting(false);
    await load();
  };

  const pendingCode = telegramCode ?? telegram?.pendingCode ?? null;
  const pendingDeepLink =
    deepLink ??
    (telegram?.botUsername && pendingCode
      ? `https://t.me/${telegram.botUsername}?start=${encodeURIComponent(pendingCode)}`
      : null);
  const telegramStatusText = !telegram
    ? t("disconnected")
    : !telegram.configured
      ? t("telegramNotConfigured")
      : telegram.connected
        ? `${t("connected")}${telegram.username ? ` · @${telegram.username}` : ""}${
            telegram.chatId ? ` · chat ${telegram.chatId}` : ""
          }`
        : waiting
          ? t("telegramWaiting")
          : t("disconnected");

  return (
    <section className="so-card mt-8 p-5">
      <h2 className="ycds-h3 text-[var(--so-text)]">{t("integrationsTitle")}</h2>
      <p className="mt-1 text-sm text-[var(--so-muted)]">{t("integrationsSubtitle")}</p>
      {error ? <p className="mt-3 text-sm text-[var(--destructive)]">{error}</p> : null}
      <div className="mt-4 grid gap-3">
        <Row
          title="Google Calendar"
          status={data?.googleCalendar?.connected ? t("connected") : t("disconnected")}
          action={
            data?.googleCalendar.connected ? null : (
              <a href="/api/google/calendar/connect">
                <Button size="sm">{t("connect")}</Button>
              </a>
            )
          }
        />
        <Row
          title="Gmail"
          status={
            data?.gmail?.connected
              ? `${t("connected")}${data.gmail.email ? ` · ${data.gmail.email}` : ""}`
              : t("disconnected")
          }
          action={
            data?.gmail?.connected ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={async () => {
                  await fetch("/api/ai/integrations?provider=gmail", { method: "DELETE" });
                  void load();
                }}
              >
                {t("disconnect")}
              </Button>
            ) : (
              <a href="/api/ai/integrations/gmail/connect">
                <Button size="sm">{t("connect")}</Button>
              </a>
            )
          }
        />
        <Row
          title="Telegram"
          status={telegramStatusText}
          tone={telegram?.connected ? "ok" : waiting ? "pending" : "off"}
          action={
            telegram?.connected ? (
              <Button size="sm" variant="secondary" onClick={() => void unlinkTelegram()}>
                {t("disconnect")}
              </Button>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                disabled={telegram ? !telegram.configured : false}
                onClick={() => void linkTelegram()}
              >
                {t("linkTelegram")}
              </Button>
            )
          }
        />
      </div>
      {!telegram?.connected && pendingCode ? (
        <div className="mt-3 rounded-[8px] border border-[var(--so-border)] bg-[var(--so-surface-2,transparent)] px-3 py-3">
          <p className="text-sm text-[var(--so-text)]">{t("telegramCode", { code: pendingCode })}</p>
          <p className="mt-1 text-xs text-[var(--so-muted)]">
            {waiting ? t("telegramWaitingHint") : t("telegramStepsHint")}
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {pendingDeepLink ? (
              <a href={pendingDeepLink} target="_blank" rel="noreferrer">
                <Button size="sm">
                  {telegram?.botUsername ? `${t("telegramOpenBot")} @${telegram.botUsername}` : t("telegramOpenBot")}
                </Button>
              </a>
            ) : null}
            <Button size="sm" variant="secondary" disabled={checking} onClick={() => void checkNow()}>
              {checking ? t("telegramChecking") : t("telegramCheck")}
            </Button>
          </div>
        </div>
      ) : null}
      {telegram?.connected ? (
        <p className="mt-3 text-sm text-[var(--so-text)]">
          {t("telegramLinked", {
            account: telegram.username ? `@${telegram.username}` : `chat ${telegram.chatId ?? ""}`,
          })}
        </p>
      ) : null}
    </section>
  );
}

const TONE_DOT: Record<"ok" | "pending" | "off", string> = {
  ok: "bg-[var(--so-success,#12b76a)]",
  pending: "bg-[var(--so-warning,#f79009)]",
  off: "bg-[var(--so-border)]",
};

function Row({
  title,
  status,
  action,
  tone,
}: {
  title: string;
  status: string;
  action: ReactNode;
  tone?: "ok" | "pending" | "off";
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[8px] border border-[var(--so-border)] px-3 py-2.5">
      <div>
        <div className="text-sm font-medium text-[var(--so-text)]">{title}</div>
        <div className="flex items-center gap-1.5 text-xs text-[var(--so-muted)]">
          {tone ? <span className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[tone]}`} aria-hidden /> : null}
          {status}
        </div>
      </div>
      {action}
    </div>
  );
}
