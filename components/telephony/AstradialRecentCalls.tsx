"use client";

import { useCallback, useEffect, useState } from "react";
import { formatCallAtJerusalem, formatCallDuration } from "@/lib/call-center/phone";
import { Button } from "@/components/ui/Button";
import type { TelephonyCallRow } from "@/lib/telephony/calls-repository";

type CallWithAi = TelephonyCallRow & {
  transcription?: string | null;
  summary?: string | null;
};

export function AstradialRecentCalls() {
  const [calls, setCalls] = useState<CallWithAi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/telephony/calls?scope=mine&limit=30", { cache: "no-store" });
    const json = (await res.json()) as { ok?: boolean; calls?: CallWithAi[]; error?: string };
    if (!res.ok || !json.ok) {
      setError(json.error ?? "Failed to load calls.");
      setCalls([]);
      return;
    }
    setCalls(json.calls ?? []);
  }, []);

  useEffect(() => {
    void load().finally(() => setLoading(false));
  }, [load]);

  const summarize = async (callId: string) => {
    setBusyId(callId);
    setError(null);
    try {
      const res = await fetch(
        `/api/telephony/calls/${encodeURIComponent(callId)}/summarize?force=1`,
        { method: "POST" },
      );
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        transcription?: string;
        summary?: string;
      };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Summarize failed.");
        return;
      }
      setExpanded((prev) => ({
        ...prev,
        [callId]: [json.summary, json.transcription].filter(Boolean).join("\n\n"),
      }));
      await load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="so-card space-y-3 p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="ycds-h3 text-[var(--so-text)]">My recent calls</h3>
        <Button type="button" size="sm" variant="secondary" onClick={() => void load()} disabled={loading}>
          Refresh
        </Button>
      </div>
      {loading ? <p className="text-sm text-[var(--so-muted)]">Loading…</p> : null}
      {error ? <p className="text-sm text-[var(--destructive)]">{error}</p> : null}
      {!loading && calls.length === 0 ? (
        <p className="text-sm text-[var(--so-muted)]">No calls yet. Dial a number above.</p>
      ) : null}
      {calls.length > 0 ? (
        <div className="overflow-x-auto rounded-[8px] border border-[var(--so-border)]">
          <table className="w-full text-left text-xs">
            <thead className="bg-[var(--so-surface-hover)] text-[var(--so-muted)]">
              <tr>
                <th className="px-2 py-1.5 font-semibold">When</th>
                <th className="px-2 py-1.5 font-semibold">Number</th>
                <th className="px-2 py-1.5 font-semibold">Dir</th>
                <th className="px-2 py-1.5 font-semibold">Dur</th>
                <th className="px-2 py-1.5 font-semibold">Rec</th>
                <th className="px-2 py-1.5 font-semibold">AI</th>
              </tr>
            </thead>
            <tbody>
              {calls.map((c) => {
                const peer = c.direction === "outbound" ? c.toNumber : c.fromNumber;
                return (
                  <tr key={c.id} className="border-t border-[var(--so-border)] text-[var(--so-text)] align-top">
                    <td className="px-2 py-1.5 whitespace-nowrap">{formatCallAtJerusalem(c.startedAt)}</td>
                    <td className="px-2 py-1.5">{peer ?? "—"}</td>
                    <td className="px-2 py-1.5">{c.direction ?? "—"}</td>
                    <td className="px-2 py-1.5">{formatCallDuration(c.durationSec)}</td>
                    <td className="px-2 py-1.5">
                      {c.providerCallId || c.recordingRef ? (
                        <a
                          className="underline"
                          href={`/api/telephony/recordings/${encodeURIComponent(c.id)}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Play
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex flex-col gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          loading={busyId === c.id}
                          disabled={busyId === c.id || !(c.providerCallId || c.recordingRef)}
                          onClick={() => void summarize(c.id)}
                        >
                          {c.summary ? "Re-summarize" : "Summarize"}
                        </Button>
                        {(expanded[c.id] || c.summary) && (
                          <p className="max-w-[28rem] whitespace-pre-wrap text-[11px] text-[var(--so-muted)]">
                            {expanded[c.id] || c.summary}
                          </p>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
