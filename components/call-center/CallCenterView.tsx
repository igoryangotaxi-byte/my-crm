"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Phone, PhoneOff, PhoneForwarded, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useCallCenterLiveOptional } from "@/components/call-center/CallCenterLiveContext";
import { useAuth } from "@/components/auth/AuthProvider";
import { cn } from "@/lib/ui/cn";

type StatusPayload = {
  ok?: boolean;
  companyConfigured?: boolean;
  supabaseConfigured?: boolean;
  linked?: boolean;
  extension?: string | null;
  preferredDeviceId?: string | null;
  operatorStatus?: string;
  notificationsMuted?: boolean;
  threeCxProfileName?: string | null;
  threeCxQueueStatus?: string | null;
  error?: string;
};

type Device = { id: string; name: string | null; userAgent: string | null };

type CallHistoryRow = {
  id: string;
  phone: string;
  direction: string | null;
  callType: string | null;
  contactName: string | null;
  agentExtension: string | null;
  agentName: string | null;
  durationSec: number | null;
  callAt: string | null;
  description: string | null;
  recordingUrl: string | null;
  summary: string | null;
  transcription: string | null;
};

const STATUSES = ["available", "away", "dnd", "offline"] as const;

function formatDuration(sec: number | null): string {
  if (sec == null) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatCallAt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

export function CallCenterView() {
  const t = useTranslations("salesOperation.callCenter");
  const { currentUser } = useAuth();
  const live = useCallCenterLiveOptional();
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [extension, setExtension] = useState("");
  const [preferredDeviceId, setPreferredDeviceId] = useState("");
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [dialPhone, setDialPhone] = useState("");
  const [transferTo, setTransferTo] = useState("");
  const [calling, setCalling] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [calls, setCalls] = useState<CallHistoryRow[]>([]);
  const [callsLoading, setCallsLoading] = useState(false);
  const [historyScope, setHistoryScope] = useState<"mine" | "all">("mine");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadCalls = useCallback(async () => {
    setCallsLoading(true);
    try {
      const qs = historyScope === "all" ? "?scope=all" : "";
      const res = await fetch(`/api/sales-operation/call-center/calls${qs}`, { cache: "no-store" });
      const json = (await res.json()) as { ok?: boolean; calls?: CallHistoryRow[]; error?: string };
      if (res.ok && json.ok) setCalls(json.calls ?? []);
    } finally {
      setCallsLoading(false);
    }
  }, [historyScope]);

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/sales-operation/call-center/status", { cache: "no-store" });
    const json = (await res.json()) as StatusPayload;
    if (!res.ok || !json.ok) {
      setError(json.error ?? t("loadError"));
      setStatus(null);
      return;
    }
    setStatus(json);
    setExtension(json.extension ?? "");
    setPreferredDeviceId(json.preferredDeviceId ?? "");
  }, [t]);

  useEffect(() => {
    void load().finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    void loadCalls();
  }, [loadCalls]);

  const loadDevices = async () => {
    setLoadingDevices(true);
    setError(null);
    setMessage(null);
    try {
      const qs = extension.trim() ? `?extension=${encodeURIComponent(extension.trim())}` : "";
      const res = await fetch(`/api/sales-operation/call-center/devices${qs}`, { cache: "no-store" });
      const json = (await res.json()) as { ok?: boolean; devices?: Device[]; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? t("devicesError"));
        setDevices([]);
        return;
      }
      setDevices(json.devices ?? []);
      if ((json.devices ?? []).length === 0) setMessage(t("noDevices"));
    } finally {
      setLoadingDevices(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/sales-operation/call-center/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          extension: extension.trim(),
          preferredDeviceId: preferredDeviceId.trim() || null,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? t("saveError"));
        return;
      }
      setMessage(t("saved"));
      await load();
      await live?.refresh();
    } finally {
      setSaving(false);
    }
  };

  const disconnect = async () => {
    setDisconnecting(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/sales-operation/call-center/settings", { method: "DELETE" });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? t("saveError"));
        return;
      }
      setExtension("");
      setPreferredDeviceId("");
      setDevices([]);
      setMessage(t("disconnected"));
      await load();
      await live?.refresh();
    } finally {
      setDisconnecting(false);
    }
  };

  const updateStatus = async (operatorStatus: string) => {
    setError(null);
    try {
      if (live) {
        await live.setOperatorStatus(operatorStatus);
      } else {
        const res = await fetch("/api/sales-operation/call-center/operator-status", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ operatorStatus }),
        });
        const json = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || !json.ok) throw new Error(json.error ?? t("saveError"));
      }
      setMessage(t("statusSaved"));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("saveError"));
    }
  };

  const toggleMute = async (muted: boolean) => {
    setError(null);
    try {
      if (live) {
        await live.setNotificationsMuted(muted);
      } else {
        const res = await fetch("/api/sales-operation/call-center/operator-status", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notificationsMuted: muted }),
        });
        const json = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || !json.ok) throw new Error(json.error ?? t("saveError"));
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("saveError"));
    }
  };

  const dial = async () => {
    setCalling(true);
    setError(null);
    setMessage(null);
    try {
      const result = live
        ? await live.makecall(dialPhone.trim())
        : await (async () => {
            const res = await fetch("/api/sales-operation/call-center/makecall", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ phone: dialPhone.trim() }),
            });
            const json = (await res.json()) as { ok?: boolean; error?: string };
            return { ok: Boolean(res.ok && json.ok), error: json.error };
          })();
      if (!result.ok) {
        setError(result.error ?? t("callFailed"));
        return;
      }
      setMessage(t("callStarted"));
    } finally {
      setCalling(false);
    }
  };

  const runLiveAction = async (
    action: "answer" | "drop" | "transferto",
    participantId: number,
  ) => {
    if (!live) return;
    setActionBusy(true);
    setError(null);
    const result = await live.runAction(
      participantId,
      action,
      action === "transferto" ? transferTo.trim() : undefined,
    );
    if (!result.ok) setError(result.error ?? t("actionFailed"));
    setActionBusy(false);
  };

  const operatorStatus = live?.operatorStatus ?? status?.operatorStatus ?? "available";
  const notificationsMuted =
    live?.notificationsMuted ?? status?.notificationsMuted ?? false;
  const active = live?.active ?? null;
  const incoming = live?.incoming ?? null;
  const focusCall = active ?? incoming;

  if (loading) {
    return <p className="text-sm text-[var(--so-muted)]">{t("subtitle")}</p>;
  }

  return (
    <div className="mx-auto grid max-w-4xl gap-4 lg:grid-cols-2">
      <section className="so-card space-y-4 p-5 lg:col-span-2">
        <div>
          <h2 className="ycds-h3 text-[var(--so-text)]">{t("title")}</h2>
          <p className="mt-1 text-sm text-[var(--so-muted)]">{t("subtitle")}</p>
        </div>
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--so-border)] pb-2">
            <span className="text-[var(--so-muted)]">{t("pbxStatus")}</span>
            <span className="text-[var(--so-text)]">
              {status?.companyConfigured ? t("pbxConfigured") : t("pbxMissing")}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 border-b border-[var(--so-border)] pb-2">
            <span className="text-[var(--so-muted)]">Link</span>
            <span className="text-[var(--so-text)]">
              {status?.linked && status.extension
                ? t("linkedAs", { extension: status.extension })
                : t("notLinked")}
            </span>
          </div>
        </div>
        {!status?.supabaseConfigured ? (
          <p className="text-sm text-[var(--destructive)]">{t("supabaseMissing")}</p>
        ) : null}
        {live?.error ? (
          <p className="text-sm text-[var(--so-muted)]">
            {t("liveError")}: {live.error}
          </p>
        ) : null}
      </section>

      <section className="so-card space-y-3 p-5">
        <h3 className="ycds-h3 text-[var(--so-text)]">{t("accountTitle")}</h3>
        <label className="grid gap-1.5 text-sm">
          <span className="text-[var(--so-muted)]">{t("extension")}</span>
          <input
            value={extension}
            onChange={(e) => setExtension(e.target.value)}
            placeholder={t("extensionPlaceholder")}
            className="h-9 rounded-[8px] border border-[var(--so-border-strong)] bg-[var(--so-surface)] px-3 text-[var(--so-text)] outline-none focus:border-[var(--so-accent)]"
            inputMode="numeric"
            autoComplete="off"
          />
        </label>
        <div className="flex flex-wrap items-end gap-2">
          <label className="grid min-w-[12rem] flex-1 gap-1.5 text-sm">
            <span className="text-[var(--so-muted)]">{t("device")}</span>
            <select
              value={preferredDeviceId}
              onChange={(e) => setPreferredDeviceId(e.target.value)}
              className="h-9 rounded-[8px] border border-[var(--so-border-strong)] bg-[var(--so-surface)] px-3 text-[var(--so-text)] outline-none focus:border-[var(--so-accent)]"
            >
              <option value="">{t("devicePlaceholder")}</option>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name || d.userAgent || d.id}
                </option>
              ))}
              {preferredDeviceId && !devices.some((d) => d.id === preferredDeviceId) ? (
                <option value={preferredDeviceId}>{preferredDeviceId}</option>
              ) : null}
            </select>
          </label>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => void loadDevices()}
            disabled={loadingDevices || !extension.trim() || !status?.companyConfigured}
          >
            {loadingDevices ? t("loadingDevices") : t("loadDevices")}
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => void save()}
            disabled={saving || !extension.trim() || !status?.supabaseConfigured}
          >
            {saving ? t("saving") : t("save")}
          </Button>
          {status?.linked ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => void disconnect()}
              disabled={disconnecting}
            >
              {disconnecting ? t("disconnecting") : t("disconnect")}
            </Button>
          ) : null}
        </div>
      </section>

      <section className="so-card space-y-3 p-5">
        <h3 className="ycds-h3 text-[var(--so-text)]">{t("statusTitle")}</h3>
        <p className="text-xs text-[var(--so-muted)]">{t("statusHint")}</p>
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((key) => (
            <button
              key={key}
              type="button"
              disabled={!status?.linked}
              onClick={() => void updateStatus(key)}
              className={cn(
                "h-8 rounded-[8px] border px-3 text-xs font-semibold transition-colors disabled:opacity-50",
                operatorStatus === key
                  ? "border-[var(--so-accent)] bg-[var(--so-accent)]/10 text-[var(--so-text)]"
                  : "border-[var(--so-border)] text-[var(--so-muted)] hover:bg-[var(--so-surface-hover)]",
              )}
            >
              {key === "available"
                ? t("statusAvailable")
                : key === "away"
                  ? t("statusAway")
                  : key === "dnd"
                    ? t("statusDnd")
                    : t("statusOffline")}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-[var(--so-text)]">
          <input
            type="checkbox"
            checked={notificationsMuted}
            disabled={!status?.linked}
            onChange={(e) => void toggleMute(e.target.checked)}
          />
          <span>{t("muteNotifications")}</span>
        </label>
        <p className="text-xs text-[var(--so-muted)]">{t("muteHint")}</p>
        {(status?.threeCxProfileName || status?.threeCxQueueStatus) && (
          <div className="grid gap-1 text-xs text-[var(--so-muted)]">
            {status.threeCxProfileName ? (
              <span>
                {t("profileLabel")}: {status.threeCxProfileName}
              </span>
            ) : null}
            {status.threeCxQueueStatus ? (
              <span>
                {t("queueLabel")}: {status.threeCxQueueStatus}
              </span>
            ) : null}
          </div>
        )}
      </section>

      <section className="so-card space-y-3 p-5">
        <h3 className="ycds-h3 text-[var(--so-text)]">{t("dialerTitle")}</h3>
        <div className="flex flex-wrap items-end gap-2">
          <label className="grid min-w-[14rem] flex-1 gap-1.5 text-sm">
            <span className="text-[var(--so-muted)]">{t("testPhone")}</span>
            <input
              value={dialPhone}
              onChange={(e) => setDialPhone(e.target.value)}
              placeholder={t("dialerPlaceholder")}
              className="h-9 rounded-[8px] border border-[var(--so-border-strong)] bg-[var(--so-surface)] px-3 text-[var(--so-text)] outline-none focus:border-[var(--so-accent)]"
            />
          </label>
          <Button
            type="button"
            size="sm"
            onClick={() => void dial()}
            disabled={calling || !dialPhone.trim() || !status?.linked || !status?.companyConfigured}
            leftIcon={<Phone className="h-3.5 w-3.5" />}
          >
            {calling ? t("calling") : t("testCall")}
          </Button>
        </div>
      </section>

      <section className="so-card space-y-3 p-5">
        <h3 className="ycds-h3 text-[var(--so-text)]">{t("activeTitle")}</h3>
        {!focusCall ? (
          <p className="text-sm text-[var(--so-muted)]">{t("noActiveCall")}</p>
        ) : (
          <>
            <div className="text-sm">
              <p className="font-semibold text-[var(--so-text)]">
                {focusCall.partyCallerName ||
                  focusCall.partyCallerId ||
                  focusCall.partyDn ||
                  `#${focusCall.id}`}
              </p>
              <p className="text-xs text-[var(--so-muted)]">{focusCall.status}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {incoming && incoming.id === focusCall.id ? (
                <Button
                  type="button"
                  size="sm"
                  disabled={actionBusy}
                  onClick={() => void runLiveAction("answer", focusCall.id)}
                  leftIcon={<Phone className="h-3.5 w-3.5" />}
                >
                  {t("answer")}
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={actionBusy}
                onClick={() => void runLiveAction("drop", focusCall.id)}
                leftIcon={<PhoneOff className="h-3.5 w-3.5" />}
              >
                {t("hangup")}
              </Button>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <input
                value={transferTo}
                onChange={(e) => setTransferTo(e.target.value)}
                placeholder={t("transferPlaceholder")}
                className="h-9 min-w-[10rem] flex-1 rounded-[8px] border border-[var(--so-border-strong)] bg-[var(--so-surface)] px-3 text-sm text-[var(--so-text)] outline-none focus:border-[var(--so-accent)]"
              />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={actionBusy || !transferTo.trim()}
                onClick={() => void runLiveAction("transferto", focusCall.id)}
                leftIcon={<PhoneForwarded className="h-3.5 w-3.5" />}
              >
                {t("transfer")}
              </Button>
            </div>
          </>
        )}
      </section>

      <section className="so-card space-y-3 p-5 lg:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="ycds-h3 text-[var(--so-text)]">{t("historyTitle")}</h3>
          <div className="flex flex-wrap items-center gap-2">
            {currentUser?.role === "Admin" ? (
              <select
                value={historyScope}
                onChange={(e) => setHistoryScope(e.target.value === "all" ? "all" : "mine")}
                className="h-8 rounded-[8px] border border-[var(--so-border)] bg-[var(--so-surface)] px-2 text-xs"
              >
                <option value="mine">{t("historyMine")}</option>
                <option value="all">{t("historyAll")}</option>
              </select>
            ) : null}
            <Button type="button" size="sm" variant="secondary" onClick={() => void loadCalls()}>
              {callsLoading ? t("historyLoading") : t("historyRefresh")}
            </Button>
          </div>
        </div>
        <p className="text-xs text-[var(--so-muted)]">{t("historyHint")}</p>
        {calls.length === 0 ? (
          <p className="text-sm text-[var(--so-muted)]">{t("historyEmpty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--so-border)] text-[var(--so-muted)]">
                  <th className="px-2 py-2 font-semibold">{t("historyWhen")}</th>
                  <th className="px-2 py-2 font-semibold">{t("historyDir")}</th>
                  <th className="px-2 py-2 font-semibold">{t("historyPhone")}</th>
                  <th className="px-2 py-2 font-semibold">{t("historyDuration")}</th>
                  <th className="px-2 py-2 font-semibold">{t("historyRecording")}</th>
                </tr>
              </thead>
              <tbody>
                {calls.map((call) => (
                  <tr key={call.id} className="border-b border-[var(--so-border)] align-top">
                    <td className="px-2 py-2 text-[var(--so-text)]">{formatCallAt(call.callAt)}</td>
                    <td className="px-2 py-2 text-[var(--so-text)]">
                      {[call.direction, call.callType].filter(Boolean).join(" / ") || "—"}
                    </td>
                    <td className="px-2 py-2 text-[var(--so-text)]">
                      <div className="font-medium">{call.contactName || call.phone}</div>
                      {call.contactName ? (
                        <div className="text-[var(--so-muted)]">{call.phone}</div>
                      ) : null}
                    </td>
                    <td className="px-2 py-2 tabular-nums text-[var(--so-text)]">
                      {formatDuration(call.durationSec)}
                    </td>
                    <td className="px-2 py-2">
                      {call.recordingUrl ? (
                        <div className="flex flex-col gap-1">
                          <audio controls preload="none" className="h-8 max-w-[14rem]" src={call.recordingUrl} />
                          <a
                            href={call.recordingUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[var(--so-accent)] hover:underline"
                          >
                            <ExternalLink className="h-3 w-3" />
                            {t("historyOpenRecording")}
                          </a>
                        </div>
                      ) : (
                        <span className="text-[var(--so-muted)]">{t("historyNoRecording")}</span>
                      )}
                      {(call.summary || call.transcription) && (
                        <button
                          type="button"
                          className="mt-1 text-[10px] text-sky-700 hover:underline"
                          onClick={() =>
                            setExpandedId((id) => (id === call.id ? null : call.id))
                          }
                        >
                          {expandedId === call.id ? t("historyHideNotes") : t("historyShowNotes")}
                        </button>
                      )}
                      {expandedId === call.id ? (
                        <div className="mt-1 max-w-md space-y-1 text-[10px] text-[var(--so-muted)]">
                          {call.summary ? <p>{call.summary}</p> : null}
                          {call.transcription ? <p className="whitespace-pre-wrap">{call.transcription}</p> : null}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="so-card space-y-2 p-5 lg:col-span-2">
        <h3 className="ycds-h3 text-[var(--so-text)]">{t("howTitle")}</h3>
        <p className="text-sm text-[var(--so-muted)]">{t("howBody")}</p>
      </section>

      {error ? <p className="text-sm text-[var(--destructive)] lg:col-span-2">{error}</p> : null}
      {message ? <p className="text-sm text-[var(--so-accent)] lg:col-span-2">{message}</p> : null}
    </div>
  );
}
