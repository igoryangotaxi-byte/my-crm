"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Phone, PhoneOff, X } from "lucide-react";
import { ClickToCallButton } from "@/components/call-center/DriverCallButton";
import {
  useCallCenterLive,
  type CallCenterParticipant,
} from "@/components/call-center/CallCenterLiveContext";
import type { CrmCallEntityType, CrmScreenPopEntity } from "@/lib/call-center/baroz-crm";
import {
  callerPhoneFromParty,
  formatCallAtJerusalem,
  formatCallDuration,
} from "@/lib/call-center/phone";
import type { CallCenterCallRecord } from "@/lib/call-center/calls-repository";

type LookupPayload = {
  ok?: boolean;
  entity?: CrmScreenPopEntity | null;
  lastCall?: CallCenterCallRecord | null;
  error?: string;
};

function entityLabel(type: CrmCallEntityType | null | undefined): string {
  if (type === "client") return "Client";
  if (type === "driver") return "Driver";
  if (type === "lead") return "Lead";
  return "Unknown";
}

export function CallCenterScreenPop() {
  const live = useCallCenterLive();
  const incoming = live.incoming;
  const [dismissedIncomingId, setDismissedIncomingId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [createName, setCreateName] = useState("");
  const [creating, setCreating] = useState(false);
  const [lookup, setLookup] = useState<LookupPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [pinned, setPinned] = useState<{ phone: string; name: string } | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const beepTimerRef = useRef<number | null>(null);

  const incomingPhone = incoming ? callerPhoneFromParty(incoming.partyCallerId || incoming.partyDn) : "";
  const showIncoming =
    Boolean(live.linked && incoming && dismissedIncomingId !== incoming.id) &&
    live.operatorStatus !== "dnd" &&
    live.operatorStatus !== "offline";

  useEffect(() => {
    if (showIncoming && incomingPhone) {
      setPinned({ phone: incomingPhone, name: incoming?.partyCallerName || "" });
    }
  }, [showIncoming, incomingPhone, incoming?.partyCallerName]);

  const phone = (showIncoming ? incomingPhone : null) || live.screenPopRequest?.phone?.trim() || pinned?.phone || "";
  const fallbackName = showIncoming
    ? incoming?.partyCallerName || ""
    : live.screenPopRequest?.name || pinned?.name || "";
  const open = Boolean(phone);

  useEffect(() => {
    if (!showIncoming || !incoming || live.notificationsMuted) {
      if (beepTimerRef.current) {
        window.clearInterval(beepTimerRef.current);
        beepTimerRef.current = null;
      }
      return;
    }
    const beep = () => {
      try {
        const Ctx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!Ctx) return;
        if (!audioCtxRef.current) audioCtxRef.current = new Ctx();
        const ctx = audioCtxRef.current;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = 880;
        gain.gain.value = 0.04;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.12);
      } catch {
        // Ignore autoplay restrictions.
      }
    };
    beep();
    beepTimerRef.current = window.setInterval(beep, 1800);
    return () => {
      if (beepTimerRef.current) {
        window.clearInterval(beepTimerRef.current);
        beepTimerRef.current = null;
      }
    };
  }, [showIncoming, incoming?.id, live.notificationsMuted]);

  useEffect(() => {
    if (!phone) {
      setLookup(null);
      setCreateName("");
      return;
    }
    let cancelled = false;
    setLoading(true);
    void fetch(`/api/sales-operation/call-center/lookup?phone=${encodeURIComponent(phone)}`, {
      cache: "no-store",
    })
      .then(async (res) => (await res.json()) as LookupPayload)
      .then((json) => {
        if (!cancelled) setLookup(json);
      })
      .catch(() => {
        if (!cancelled) setLookup({ ok: false, entity: null, lastCall: null });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [phone]);

  const entity = lookup?.entity ?? null;
  const lastCall = lookup?.lastCall ?? null;
  const displayName = entity?.name || fallbackName || "—";
  const displayPhone = entity?.phone || phone;
  const lastCallLine = useMemo(() => {
    if (!lastCall) return "—";
    return [
      formatCallAtJerusalem(lastCall.callAt),
      lastCall.direction,
      formatCallDuration(lastCall.durationSec),
    ]
      .filter((part) => part && part !== "—")
      .join(" · ");
  }, [lastCall]);

  const close = () => {
    if (incoming) setDismissedIncomingId(incoming.id);
    setPinned(null);
    live.closeScreenPop();
  };

  const onAnswer = async (p: CallCenterParticipant) => {
    setBusy(true);
    await live.runAction(p.id, "answer");
    setBusy(false);
  };

  const onDecline = async (p: CallCenterParticipant) => {
    setBusy(true);
    await live.runAction(p.id, "drop");
    setDismissedIncomingId(p.id);
    setBusy(false);
  };

  const onCreate = async () => {
    setCreating(true);
    try {
      const res = await fetch("/api/sales-operation/call-center/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: displayPhone,
          firstName: createName.trim() || fallbackName || "Unknown",
        }),
      });
      const json = (await res.json()) as LookupPayload;
      if (res.ok && json.ok) setLookup(json);
    } finally {
      setCreating(false);
    }
  };

  if (!open) return null;

  return (
    <aside
      className="pointer-events-auto fixed inset-y-0 right-0 z-[92] flex w-[400px] max-w-[100vw] flex-col border-l border-[var(--so-border)] bg-[var(--so-surface)] shadow-[var(--so-shadow-md)]"
      data-module="sales-operation"
      aria-label="Call screen pop"
    >
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-[var(--so-border)] px-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--so-muted)]">
          {showIncoming ? "Incoming call" : "Contact"}
        </p>
        <button
          type="button"
          aria-label="Close"
          className="rounded-md p-1 text-[var(--so-muted)] hover:bg-[var(--so-surface-hover)]"
          onClick={close}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {loading ? <p className="text-xs text-[var(--so-muted)]">Looking up…</p> : null}

        {entity ? (
          <>
            <div>
              <p className="ycds-h3 truncate text-[var(--so-text)]">{displayName}</p>
              <p className="mt-0.5 font-medium tabular-nums text-sm text-[var(--so-text)]">{displayPhone}</p>
              <p className="mt-1 text-[11px] text-[var(--so-muted)]">{entityLabel(entity.entityType)}</p>
            </div>
            <p className="text-xs text-[var(--so-muted)]">
              Last call: <span className="text-[var(--so-text)]">{lastCallLine}</span>
            </p>
            <div className="flex flex-wrap gap-2">
              <ClickToCallButton
                phone={displayPhone}
                variant="dialPrimary"
                emptyReason="No phone number"
                stopPropagation={false}
              />
              <Link
                href={entity.contactUrl.replace(/^https?:\/\/[^/]+/, "") || entity.contactUrl}
                className="so-focus-ring inline-flex h-8 items-center rounded-[8px] border border-[var(--so-border-strong)] px-3 text-xs font-semibold text-[var(--so-text)] hover:bg-[var(--so-surface-hover)]"
              >
                Open card
              </Link>
            </div>
          </>
        ) : (
          <>
            <p className="ycds-h3 text-[var(--so-text)]">No contact</p>
            <p className="font-medium tabular-nums text-sm text-[var(--so-text)]">{displayPhone || "—"}</p>
            <p className="text-xs text-[var(--so-muted)]">
              Last call: <span className="text-[var(--so-text)]">{lastCallLine}</span>
            </p>
            <div className="flex flex-wrap gap-2">
              <ClickToCallButton
                phone={displayPhone}
                variant="dialPrimary"
                emptyReason="No phone number"
                stopPropagation={false}
              />
            </div>
            <label className="grid gap-1 text-xs">
              <span className="text-[var(--so-muted)]">Create lead</span>
              <input
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder={fallbackName || "First name"}
                className="crm-input h-8 px-2.5 text-sm"
              />
            </label>
            <button
              type="button"
              disabled={creating || !displayPhone}
              onClick={() => void onCreate()}
              className="so-focus-ring inline-flex h-8 items-center rounded-[8px] border border-[var(--so-border-strong)] px-3 text-xs font-semibold text-[var(--so-text)] hover:bg-[var(--so-surface-hover)] disabled:opacity-50"
            >
              {creating ? "Creating…" : "Create"}
            </button>
          </>
        )}

        {showIncoming && incoming ? (
          <div className="flex gap-2 border-t border-[var(--so-border)] pt-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => void onAnswer(incoming)}
              className="so-focus-ring inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-[8px] border border-[var(--so-border-strong)] px-3 text-xs font-semibold text-[var(--so-text)] hover:bg-[var(--so-surface-hover)]"
            >
              <Phone className="h-3.5 w-3.5" />
              Answer
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void onDecline(incoming)}
              className="so-focus-ring inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-[8px] border border-[var(--so-border)] px-3 text-xs font-semibold text-[var(--so-muted)] hover:bg-[var(--so-surface-hover)]"
            >
              <PhoneOff className="h-3.5 w-3.5" />
              Decline
            </button>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
