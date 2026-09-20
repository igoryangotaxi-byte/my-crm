"use client";

import { useEffect, useState } from "react";
import { formatCallAtJerusalem, formatCallDuration } from "@/lib/call-center/phone";
import type { TelephonyCallRow } from "@/lib/telephony/calls-repository";

type Props = {
  phone?: string | null;
  entityType?: string;
  entityId?: string;
  className?: string;
};

function isTelephonyUiEnabled(): boolean {
  const raw = process.env.NEXT_PUBLIC_TELEPHONY_ENABLED?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function TelephonyCallHistory({ phone, entityType, entityId, className }: Props) {
  const enabled = isTelephonyUiEnabled();
  const [calls, setCalls] = useState<TelephonyCallRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (!phone && !(entityType && entityId)) return;
    let active = true;
    setLoading(true);
    const qs = new URLSearchParams();
    if (phone) qs.set("phone", phone);
    if (entityType) qs.set("entityType", entityType);
    if (entityId) qs.set("entityId", entityId);
    qs.set("limit", "20");
    fetch(`/api/telephony/calls?${qs.toString()}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((json: { ok?: boolean; calls?: TelephonyCallRow[]; error?: string }) => {
        if (!active) return;
        if (!json.ok) {
          setError(json.error ?? "Failed to load calls.");
          setCalls([]);
          return;
        }
        setCalls(json.calls ?? []);
        setError(null);
      })
      .catch(() => {
        if (active) setError("Failed to load calls.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [enabled, phone, entityType, entityId]);

  if (!enabled) return null;

  return (
    <section className={className}>
      <h3 className="ycds-h3 mb-2 text-[var(--so-text)]">Calls</h3>
      {loading ? <p className="text-sm text-[var(--so-muted)]">Loading…</p> : null}
      {error ? <p className="text-sm text-[var(--destructive)]">{error}</p> : null}
      {!loading && !error && calls.length === 0 ? (
        <p className="text-sm text-[var(--so-muted)]">No Astradial calls yet.</p>
      ) : null}
      {calls.length > 0 ? (
        <div className="overflow-x-auto rounded-[8px] border border-[var(--so-border)]">
          <table className="w-full text-left text-xs">
            <thead className="bg-[var(--so-surface-hover)] text-[var(--so-muted)]">
              <tr>
                <th className="px-2 py-1.5 font-semibold">When</th>
                <th className="px-2 py-1.5 font-semibold">Dir</th>
                <th className="px-2 py-1.5 font-semibold">Agent</th>
                <th className="px-2 py-1.5 font-semibold">Dur</th>
                <th className="px-2 py-1.5 font-semibold">Result</th>
                <th className="px-2 py-1.5 font-semibold">Rec</th>
              </tr>
            </thead>
            <tbody>
              {calls.map((c) => (
                <tr key={c.id} className="border-t border-[var(--so-border)] text-[var(--so-text)]">
                  <td className="px-2 py-1.5 whitespace-nowrap">{formatCallAtJerusalem(c.startedAt)}</td>
                  <td className="px-2 py-1.5">{c.direction ?? "—"}</td>
                  <td className="px-2 py-1.5">{c.agentExtension ?? "—"}</td>
                  <td className="px-2 py-1.5">{formatCallDuration(c.durationSec)}</td>
                  <td className="px-2 py-1.5">{c.status}</td>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
