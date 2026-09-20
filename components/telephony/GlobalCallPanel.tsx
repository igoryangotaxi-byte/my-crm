"use client";

import Link from "next/link";
import { Phone, PhoneOff } from "lucide-react";
import { useTelephonyLiveOptional } from "@/components/telephony/TelephonyLiveContext";
import { cn } from "@/lib/ui/cn";

export function GlobalCallPanel() {
  const live = useTelephonyLiveOptional();
  if (!live?.enabled) return null;

  const showIncoming =
    live.ringing &&
    live.dismissedRingKey !== live.ringing.channelId &&
    !live.active;

  const showActive = Boolean(live.active);

  if (!showIncoming && !showActive && !live.providerError) return null;

  const match = live.enrichment.length === 1 ? live.enrichment[0] : null;
  const phone = live.ringing?.from || live.active?.from || live.active?.to || "—";

  return (
    <div
      className={cn(
        "fixed bottom-4 right-4 z-[80] w-[min(100vw-2rem,22rem)] rounded-[12px] border border-[var(--so-border-strong)] bg-[var(--so-surface)] p-4 shadow-[var(--shadow-panel)]",
      )}
      role="dialog"
      aria-label="Active call"
    >
      {live.providerError ? (
        <p className="mb-2 text-xs text-[var(--so-muted)]">Astradial: {live.providerError}</p>
      ) : null}

      {showIncoming ? (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--so-muted)]">
            Incoming call
          </p>
          {live.enrichmentMulti ? (
            <p className="text-sm text-[var(--so-text)]">
              Multiple CRM matches for {phone}. Open Astradial history to choose.
            </p>
          ) : match ? (
            <div>
              <p className="text-base font-semibold text-[var(--so-text)]">{match.name || "Unknown"}</p>
              <p className="text-xs text-[var(--so-muted)]">
                {match.entityType} · {match.entityId}
              </p>
            </div>
          ) : (
            <div>
              <p className="text-base font-semibold text-[var(--so-text)]">Unknown caller</p>
              <p className="text-xs text-[var(--so-muted)]">{phone}</p>
            </div>
          )}
          <p className="text-xs text-[var(--so-muted)]">
            Answer on your SIP phone / softphone. Appli does not carry audio.
          </p>
          <div className="flex flex-wrap gap-2">
            {match?.url ? (
              <Link
                href={match.url}
                className="inline-flex h-8 items-center rounded-[8px] border border-[var(--so-border-strong)] px-3 text-xs font-semibold text-[var(--so-text)]"
              >
                Open card
              </Link>
            ) : null}
            <button
              type="button"
              className="crm-button-primary inline-flex h-8 items-center gap-1.5 rounded-[8px] px-3 text-xs font-semibold"
              onClick={() => live.dismissIncoming()}
            >
              <Phone className="h-3.5 w-3.5" />
              Got it
            </button>
          </div>
        </div>
      ) : null}

      {showActive && live.active ? (
        <div className={cn("space-y-3", showIncoming && "mt-4 border-t border-[var(--so-border)] pt-3")}>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--so-muted)]">
            Active call
          </p>
          <p className="text-sm font-semibold text-[var(--so-text)]">
            {match?.name || phone}
          </p>
          <p className="text-xs text-[var(--so-muted)]">
            {live.active.status}
            {live.active.durationSec != null ? ` · ${live.active.durationSec}s` : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            {match?.url ? (
              <Link
                href={match.url}
                className="inline-flex h-8 items-center rounded-[8px] border border-[var(--so-border-strong)] px-3 text-xs font-semibold text-[var(--so-text)]"
              >
                Open card
              </Link>
            ) : null}
            <button
              type="button"
              className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-[var(--so-border-strong)] px-3 text-xs font-semibold text-[var(--so-text)]"
              onClick={() => void live.hangup(live.active!.channelId)}
            >
              <PhoneOff className="h-3.5 w-3.5" />
              End
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
