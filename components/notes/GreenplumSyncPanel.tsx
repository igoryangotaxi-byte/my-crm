"use client";

import { useEffect, useRef, useState } from "react";
import type { LastSyncSummary } from "@/lib/supabase";

type GreenplumSyncPanelProps = {
  localEnabled: boolean;
  remoteEnabled: boolean;
  supabaseConfigured: boolean;
  supabaseReachable: boolean;
  supabaseMessage: string;
  lastSyncSummary: LastSyncSummary;
};

type SyncResponse = {
  ok: boolean;
  message: string;
  stdout?: string;
  stderr?: string;
  progress?: number;
  done?: boolean;
};

type RemoteSyncStatusResponse = {
  ok: boolean;
  message?: string;
  current?: {
    id: string;
    status: string;
    started_at: string | null;
    finished_at: string | null;
    error_text: string | null;
    from_ts?: string | null;
    to_ts?: string | null;
  } | null;
  lastSuccessful?: {
    id: string;
    rowsLoaded: number;
    fromTs: string | null;
    toTs: string | null;
    finishedAt: string | null;
  } | null;
};

type SyncWindowPayload = {
  fromTs: string | null;
  toTs: string | null;
};

export function GreenplumSyncPanel({
  localEnabled,
  remoteEnabled,
  supabaseConfigured,
  supabaseReachable,
  supabaseMessage,
  lastSyncSummary,
}: GreenplumSyncPanelProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [result, setResult] = useState<SyncResponse | null>(null);
  const [validationResult, setValidationResult] = useState<SyncResponse | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);
  const [validationProgress, setValidationProgress] = useState(0);
  const [validationProgressMessage, setValidationProgressMessage] = useState<string | null>(null);
  const [queuedJobId, setQueuedJobId] = useState<string | null>(null);
  const [remoteStatus, setRemoteStatus] = useState<RemoteSyncStatusResponse["current"]>(null);
  const [remoteLastSuccess, setRemoteLastSuccess] =
    useState<RemoteSyncStatusResponse["lastSuccessful"]>(null);
  const [remoteStatusMessage, setRemoteStatusMessage] = useState<string | null>(null);
  const [fromDateTime, setFromDateTime] = useState("");
  const [toDateTime, setToDateTime] = useState("");
  const validationAbortRef = useRef<AbortController | null>(null);
  const isSyncAvailable = (localEnabled || remoteEnabled) && supabaseConfigured;

  const parseQueuedJobId = (message: string | undefined) => {
    if (!message) return null;
    const match = message.match(/Sync request #([0-9a-f-]{36}) queued/i);
    return match?.[1] ?? null;
  };

  const formatRemoteStateLabel = (value: string | null | undefined) => {
    if (!value) return "n/a";
    if (value === "pending") return "Queued";
    if (value === "running") return "Running";
    if (value === "success") return "Success";
    if (value === "failed") return "Failed";
    return value;
  };

  const toIsoOrNull = (value: string) => {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString();
  };

  const buildSyncWindowPayload = (): SyncWindowPayload | null => {
    if (!fromDateTime && !toDateTime) return null;
    const fromTs = toIsoOrNull(fromDateTime);
    const toTs = toIsoOrNull(toDateTime);
    if ((fromDateTime && !fromTs) || (toDateTime && !toTs)) return null;
    if (fromTs && toTs && new Date(toTs).getTime() <= new Date(fromTs).getTime()) return null;
    return { fromTs, toTs };
  };

  const runStream = async ({
    endpoint,
    setBusy,
    setPayload,
    setPct,
    setMsg,
    initialMessage,
    signal,
    abortMessage,
    onFinally,
    requestBody,
  }: {
    endpoint: string;
    setBusy: (value: boolean) => void;
    setPayload: (value: SyncResponse | null) => void;
    setPct: (value: number) => void;
    setMsg: (value: string) => void;
    initialMessage: string;
    signal?: AbortSignal;
    abortMessage?: string;
    onFinally?: () => void;
    requestBody?: SyncWindowPayload | null;
  }): Promise<SyncResponse> => {
    setBusy(true);
    setPayload(null);
    setPct(0);
    setMsg(initialMessage);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        signal,
        headers: requestBody ? { "Content-Type": "application/json" } : undefined,
        body: requestBody ? JSON.stringify(requestBody) : undefined,
      });
      if (!response.ok) {
        const fallback = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(fallback?.message ?? `Request failed with status ${response.status}.`);
      }
      if (!response.body) {
        throw new Error("Sync response stream is unavailable.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalPayload: SyncResponse | null = null;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const payload = JSON.parse(line) as SyncResponse;
          finalPayload = payload;
          if (typeof payload.progress === "number") {
            setPct(Math.max(0, Math.min(100, payload.progress)));
          }
          if (payload.message) {
            setMsg(payload.message);
          }
          if (payload.done) {
            setPayload(payload);
          }
        }
      }

      if (!finalPayload) {
        const fallbackPayload: SyncResponse = {
          ok: false,
          message: "Operation finished without status payload.",
        };
        setPayload(fallbackPayload);
        return fallbackPayload;
      }

      if (!finalPayload.done) {
        const completedPayload: SyncResponse = {
          ...finalPayload,
          done: true,
        };
        setPayload(completedPayload);
        return completedPayload;
      }

      return finalPayload;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        const message = abortMessage ?? "Operation stopped by user.";
        const abortPayload: SyncResponse = {
          ok: false,
          message,
        };
        setPayload(abortPayload);
        setMsg(message);
        return abortPayload;
      }
      const errorPayload: SyncResponse = {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Unexpected stream error",
      };
      setPayload(errorPayload);
      setMsg("Operation failed to start.");
      return errorPayload;
    } finally {
      setBusy(false);
      onFinally?.();
    }
  };

  const runSync = async (requestBody?: SyncWindowPayload | null) =>
    runStream({
      endpoint: "/api/greenplum-sync",
      setBusy: setIsRunning,
      setPayload: setResult,
      setPct: setProgress,
      setMsg: setProgressMessage,
      initialMessage: "Preparing sync...",
      requestBody,
    });

  const fetchRemoteStatus = async (jobId?: string) => {
    try {
      const query = jobId ? `?jobId=${encodeURIComponent(jobId)}` : "";
      const response = await fetch(`/api/greenplum-sync${query}`, { cache: "no-store" });
      const payload = (await response.json()) as RemoteSyncStatusResponse;
      if (!response.ok || !payload.ok) {
        setRemoteStatusMessage(payload.message ?? "Failed to load remote sync status.");
        return;
      }
      setRemoteStatus(payload.current ?? null);
      setRemoteLastSuccess(payload.lastSuccessful ?? null);
      setRemoteStatusMessage(null);
    } catch (error) {
      setRemoteStatusMessage(
        error instanceof Error ? error.message : "Failed to load remote sync status.",
      );
    }
  };

  const runSyncWithRemoteTracking = async () => {
    const windowPayload = buildSyncWindowPayload();
    if ((fromDateTime || toDateTime) && !windowPayload) {
      const invalidPayload: SyncResponse = {
        ok: false,
        message: "Invalid date-time window. Ensure To is later than From.",
      };
      setResult(invalidPayload);
      setProgressMessage(invalidPayload.message);
      return;
    }
    const payload = await runSync(windowPayload);
    const jobId = parseQueuedJobId(payload?.message);
    if (remoteEnabled && jobId) {
      setQueuedJobId(jobId);
      setProgressMessage("Request queued. Waiting for worker...");
      setProgress(20);
      await fetchRemoteStatus(jobId);
    }
  };

  useEffect(() => {
    if (!remoteEnabled) return;
    const initial = window.setTimeout(() => {
      void fetchRemoteStatus(queuedJobId ?? undefined);
    }, 0);
    const timer = window.setInterval(() => {
      void fetchRemoteStatus(queuedJobId ?? undefined);
    }, 10000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [remoteEnabled, queuedJobId]);

  const effectiveProgress = remoteEnabled
    ? remoteStatus?.status === "pending"
      ? 25
      : remoteStatus?.status === "running"
        ? 55
        : remoteStatus?.status === "success" || remoteStatus?.status === "failed"
          ? 100
          : progress
    : progress;
  const effectiveProgressMessage = remoteEnabled
    ? remoteStatus?.status === "pending"
      ? "Request queued. Waiting for worker to start."
      : remoteStatus?.status === "running"
        ? "Worker is running Greenplum sync..."
        : remoteStatus?.status === "success"
          ? "Remote sync completed successfully."
          : remoteStatus?.status === "failed"
            ? "Remote sync failed."
            : progressMessage
    : progressMessage;

  const runValidation = async () => {
    const controller = new AbortController();
    validationAbortRef.current = controller;
    return runStream({
      endpoint: "/api/greenplum-validate",
      setBusy: setIsValidating,
      setPayload: setValidationResult,
      setPct: setValidationProgress,
      setMsg: setValidationProgressMessage,
      initialMessage: "Preparing validation...",
      signal: controller.signal,
      abortMessage: "Validation stopped by user.",
      onFinally: () => {
        validationAbortRef.current = null;
      },
    });
  };

  const stopValidation = () => {
    if (!isValidating) return;
    setValidationProgressMessage("Stopping validation...");
    validationAbortRef.current?.abort();
  };

  const renderValidationButton = () =>
    isValidating ? (
      <button
        type="button"
        onClick={stopValidation}
        className="rounded-xl border border-rose-300/80 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
      >
        Stop validation
      </button>
    ) : (
      <button
        type="button"
        onClick={runValidation}
        disabled={!localEnabled || !supabaseConfigured || isRunning || isValidating}
        className="rounded-xl border border-red-300/70 bg-white/85 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        Validate Greenplum -&gt; Supabase
      </button>
    );

  const formatSyncDate = (value: string | null) => {
    if (!value) return "n/a";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
  };

  return (
    <section className="glass-surface mb-4 rounded-3xl p-4">
      <div className="mb-3">
        <h3 className="crm-section-title">DataGrip sync</h3>
        <p className="crm-subtitle">
          Trigger sync from dashboard. Local mode runs directly, remote mode queues a job for VPN worker.
        </p>
      </div>

      <div className="grid gap-3 rounded-2xl border border-border/70 bg-white/75 p-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <label className="flex flex-col gap-1 text-xs text-slate-700">
          <span className="font-semibold text-slate-900">From (optional)</span>
          <input
            type="datetime-local"
            value={fromDateTime}
            onChange={(event) => setFromDateTime(event.target.value)}
            className="rounded-xl border border-border/80 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-red-300 focus:ring-2 focus:ring-red-100"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-700">
          <span className="font-semibold text-slate-900">To (optional)</span>
          <input
            type="datetime-local"
            value={toDateTime}
            onChange={(event) => setToDateTime(event.target.value)}
            className="rounded-xl border border-border/80 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-red-300 focus:ring-2 focus:ring-red-100"
          />
        </label>
        <div className="flex items-end">
          <button
            type="button"
            onClick={() => {
              setFromDateTime("");
              setToDateTime("");
            }}
            className="rounded-xl border border-border/80 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Reset window
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={runSyncWithRemoteTracking}
          disabled={!isSyncAvailable || isRunning || isValidating}
          className="crm-button-primary rounded-xl px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isRunning ? "Sync request in progress..." : "Check DataGrip + Sync -> Supabase"}
        </button>
        {renderValidationButton()}
        {!localEnabled && remoteEnabled ? (
          <p className="text-xs text-emerald-700">
            Remote mode enabled: production click queues a sync, local VPN worker executes it.
          </p>
        ) : null}
        {!localEnabled && !remoteEnabled ? (
          <p className="text-xs text-amber-700">
            Disabled: enable local sync or remote sync requests in environment variables.
          </p>
        ) : null}
        {(localEnabled || remoteEnabled) && !supabaseConfigured ? (
          <p className="text-xs text-rose-700">
            Disabled: configure Supabase env variables first.
          </p>
        ) : null}
      </div>

      <div className="mt-3 rounded-2xl border border-border/70 bg-white/70 p-3">
        <div className="mb-1 flex items-center justify-between text-xs text-slate-700">
          <span>{effectiveProgressMessage ?? "Idle"}</span>
          <span className="font-semibold">{effectiveProgress}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-gradient-to-r from-red-400 to-red-600 transition-all duration-300"
            style={{ width: `${effectiveProgress}%` }}
          />
        </div>
      </div>
      {remoteEnabled ? (
        <div className="mt-3 rounded-2xl border border-border/70 bg-white/75 px-3 py-2 text-xs text-slate-700">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold text-slate-900">Remote queue status</p>
            <button
              type="button"
              onClick={() => fetchRemoteStatus(queuedJobId ?? undefined)}
              className="rounded-lg border border-border/80 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
            >
              Refresh
            </button>
          </div>
          {remoteStatus ? (
            <div className="mt-1 grid gap-1 sm:grid-cols-2">
              <p>
                <span className="font-semibold">Job:</span> {remoteStatus.id}
              </p>
              <p>
                <span className="font-semibold">State:</span> {formatRemoteStateLabel(remoteStatus.status)}
              </p>
              <p>
                <span className="font-semibold">Started:</span> {formatSyncDate(remoteStatus.started_at)}
              </p>
              <p>
                <span className="font-semibold">Finished:</span> {formatSyncDate(remoteStatus.finished_at)}
              </p>
              <p>
                <span className="font-semibold">From:</span> {formatSyncDate(remoteStatus.from_ts ?? null)}
              </p>
              <p>
                <span className="font-semibold">To:</span> {formatSyncDate(remoteStatus.to_ts ?? null)}
              </p>
            </div>
          ) : (
            <p className="mt-1 text-slate-600">No queued/running remote jobs yet.</p>
          )}
          {remoteStatus?.error_text ? (
            <p className="mt-1 whitespace-pre-wrap text-[11px] text-rose-700">{remoteStatus.error_text}</p>
          ) : null}
          {remoteStatusMessage ? (
            <p className="mt-1 text-[11px] text-rose-700">{remoteStatusMessage}</p>
          ) : null}
          {remoteLastSuccess ? (
            <p className="mt-2 text-[11px] text-emerald-700">
              Last successful B2B sync: {formatSyncDate(remoteLastSuccess.finishedAt)} (rows:{" "}
              {remoteLastSuccess.rowsLoaded})
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="mt-3 rounded-2xl border border-border/70 bg-white/70 p-3">
        <div className="mb-1 flex items-center justify-between text-xs text-slate-700">
          <span>{validationProgressMessage ?? "Validation idle"}</span>
          <span className="font-semibold">{validationProgress}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-indigo-600 transition-all duration-300"
            style={{ width: `${validationProgress}%` }}
          />
        </div>
      </div>

      <div
        className={`mt-3 rounded-2xl border px-3 py-2 text-xs ${
          supabaseConfigured && supabaseReachable
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : supabaseConfigured
              ? "border-amber-200 bg-amber-50 text-amber-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
        }`}
      >
        <p className="font-semibold">Supabase status</p>
        <p className="mt-0.5">{supabaseMessage}</p>
      </div>

      <div className="mt-3 rounded-2xl border border-border/70 bg-white/75 px-3 py-2 text-xs text-slate-700">
        <p className="font-semibold text-slate-900">Last successful sync window</p>
        {lastSyncSummary ? (
          <div className="mt-1 grid gap-1 sm:grid-cols-2">
            <p>
              <span className="font-semibold">Source:</span> {lastSyncSummary.sourceName}
            </p>
            <p>
              <span className="font-semibold">Rows loaded:</span> {lastSyncSummary.rowsLoaded}
            </p>
            <p>
              <span className="font-semibold">From:</span> {formatSyncDate(lastSyncSummary.fromTs)}
            </p>
            <p>
              <span className="font-semibold">To:</span> {formatSyncDate(lastSyncSummary.toTs)}
            </p>
            <p>
              <span className="font-semibold">Started:</span>{" "}
              {formatSyncDate(lastSyncSummary.startedAt)}
            </p>
            <p>
              <span className="font-semibold">Finished:</span>{" "}
              {formatSyncDate(lastSyncSummary.finishedAt)}
            </p>
          </div>
        ) : (
          <p className="mt-1 text-slate-600">
            No successful sync runs found yet. The block will update after first success.
          </p>
        )}
      </div>

      {result ? (
        <div
          className={`mt-3 rounded-2xl border px-3 py-2 text-sm ${
            result.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          <p className="font-semibold">{result.message}</p>
          {result.stderr ? (
            <p className="mt-1 whitespace-pre-wrap text-xs opacity-90">{result.stderr}</p>
          ) : null}
          {result.stdout ? (
            <p className="mt-1 whitespace-pre-wrap text-xs opacity-90">{result.stdout}</p>
          ) : null}
        </div>
      ) : null}
      {validationResult ? (
        <div
          className={`mt-3 rounded-2xl border px-3 py-2 text-sm ${
            validationResult.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          <p className="font-semibold">{validationResult.message}</p>
          {validationResult.stderr ? (
            <p className="mt-1 whitespace-pre-wrap text-xs opacity-90">{validationResult.stderr}</p>
          ) : null}
          {validationResult.stdout ? (
            <p className="mt-1 whitespace-pre-wrap text-xs opacity-90">{validationResult.stdout}</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
