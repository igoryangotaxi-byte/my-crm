"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import type { CallCenterCallRecord } from "@/lib/call-center/calls-repository";
import {
  callLogLegs,
  formatCallAtJerusalem,
  formatCallDuration,
  jerusalemDateKey,
} from "@/lib/call-center/phone";

type CallCenterHistoryTableProps = {
  calls: CallCenterCallRecord[];
  loading?: boolean;
  onOpenContact?: (phone: string, name?: string | null) => void;
};

function cardHref(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return url.startsWith("/") ? url : null;
  }
}

export function CallCenterHistoryTable({
  calls,
  loading = false,
  onOpenContact,
}: CallCenterHistoryTableProps) {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [direction, setDirection] = useState("all");
  const [agent, setAgent] = useState("all");

  const agents = useMemo(() => {
    const set = new Set<string>();
    for (const call of calls) {
      const label = call.agentName?.trim() || call.agentExtension?.trim();
      if (label) set.add(label);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [calls]);

  const filtered = useMemo(() => {
    return calls.filter((call) => {
      const day = jerusalemDateKey(call.callAt || call.createdAt);
      if (dateFrom && day && day < dateFrom) return false;
      if (dateTo && day && day > dateTo) return false;
      const dir = (call.direction || "").toLowerCase();
      if (direction === "inbound" && !dir.includes("in")) return false;
      if (direction === "outbound" && !dir.includes("out")) return false;
      if (agent !== "all") {
        const label = call.agentName?.trim() || call.agentExtension?.trim() || "";
        if (label !== agent) return false;
      }
      return true;
    });
  }, [agent, calls, dateFrom, dateTo, direction]);

  const filterClass =
    "h-8 rounded-[8px] border border-[var(--so-border)] bg-[var(--so-surface)] px-2 text-xs text-[var(--so-text)]";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className={filterClass}
          aria-label="From date"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className={filterClass}
          aria-label="To date"
        />
        <select
          value={direction}
          onChange={(e) => setDirection(e.target.value)}
          className={filterClass}
          aria-label="Direction"
        >
          <option value="all">All directions</option>
          <option value="inbound">Inbound</option>
          <option value="outbound">Outbound</option>
        </select>
        <select
          value={agent}
          onChange={(e) => setAgent(e.target.value)}
          className={filterClass}
          aria-label="Agent"
        >
          <option value="all">All agents</option>
          {agents.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        {loading ? <span className="text-[11px] text-[var(--so-muted)]">Loading…</span> : null}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-[var(--so-muted)]">No call reports yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--so-border)] text-[11px] text-[var(--so-muted)]">
                <th className="px-2 py-1 font-semibold">When</th>
                <th className="px-2 py-1 font-semibold">Dir</th>
                <th className="px-2 py-1 font-semibold">From</th>
                <th className="px-2 py-1 font-semibold">To</th>
                <th className="px-2 py-1 font-semibold">Dur</th>
                <th className="px-2 py-1 font-semibold">Agent</th>
                <th className="px-2 py-1 font-semibold">Entity</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((call) => {
                const legs = callLogLegs(call);
                const href = cardHref(call.entityUrl);
                return (
                  <tr
                    key={call.id}
                    className="h-8 cursor-pointer border-b border-[var(--so-border)] text-[var(--so-text)] hover:bg-[var(--so-surface-hover)]"
                    onClick={() => onOpenContact?.(call.phone, call.entityName || call.contactName)}
                  >
                    <td className="px-2 py-0 tabular-nums leading-8">{formatCallAtJerusalem(call.callAt)}</td>
                    <td className="px-2 py-0 leading-8">{call.direction || "—"}</td>
                    <td className="max-w-[9rem] truncate px-2 py-0 leading-8" title={legs.from}>
                      {legs.from}
                    </td>
                    <td className="max-w-[9rem] truncate px-2 py-0 leading-8" title={legs.to}>
                      {legs.to}
                    </td>
                    <td className="px-2 py-0 tabular-nums leading-8">
                      {formatCallDuration(call.durationSec)}
                    </td>
                    <td className="max-w-[8rem] truncate px-2 py-0 leading-8">
                      {call.agentName || call.agentExtension || "—"}
                    </td>
                    <td className="px-2 py-0 leading-8">
                      <span className="inline-flex items-center gap-1">
                        {href ? (
                          <Link
                            href={href}
                            onClick={(e) => e.stopPropagation()}
                            className="truncate text-[var(--so-text)] underline-offset-2 hover:underline"
                          >
                            {call.entityName || "Card"}
                          </Link>
                        ) : (
                          <span className="text-[var(--so-muted)]">—</span>
                        )}
                        {call.recordingUrl ? (
                          <a
                            href={call.recordingUrl}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-[var(--so-muted)] hover:text-[var(--so-text)]"
                            title="Recording"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : null}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
