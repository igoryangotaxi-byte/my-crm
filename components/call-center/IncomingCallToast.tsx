"use client";

import { useEffect, useRef, useState } from "react";
import { Phone, PhoneOff, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  useCallCenterLive,
  type CallCenterParticipant,
} from "@/components/call-center/CallCenterLiveContext";

function callerLabel(p: CallCenterParticipant): string {
  return p.partyCallerName || p.partyCallerId || p.partyDn || "Unknown caller";
}

function callerSub(p: CallCenterParticipant): string | null {
  const parts = [p.partyCallerId, p.partyDid].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

export function IncomingCallToast() {
  const {
    linked,
    incoming,
    operatorStatus,
    notificationsMuted,
    runAction,
  } = useCallCenterLive();
  const [busy, setBusy] = useState(false);
  const [dismissedId, setDismissedId] = useState<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const beepTimerRef = useRef<number | null>(null);

  const show =
    linked &&
    incoming &&
    dismissedId !== incoming.id &&
    !notificationsMuted &&
    operatorStatus !== "dnd" &&
    operatorStatus !== "offline";

  useEffect(() => {
    if (!show || !incoming) {
      if (beepTimerRef.current) {
        window.clearInterval(beepTimerRef.current);
        beepTimerRef.current = null;
      }
      return;
    }

    const beep = () => {
      try {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
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
        // Ignore audio autoplay restrictions.
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
  }, [show, incoming?.id]);

  if (!show || !incoming) return null;

  const onAnswer = async () => {
    setBusy(true);
    await runAction(incoming.id, "answer");
    setBusy(false);
  };

  const onDecline = async () => {
    setBusy(true);
    await runAction(incoming.id, "drop");
    setDismissedId(incoming.id);
    setBusy(false);
  };

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[90] w-[min(22rem,calc(100vw-2rem))]">
      <div className="pointer-events-auto rounded-[12px] border border-[var(--so-border-strong)] bg-[var(--so-surface)] p-4 shadow-[var(--so-shadow-md)]">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--so-muted)]">
              Incoming call
            </p>
            <p className="mt-1 truncate text-sm font-semibold text-[var(--so-text)]">
              {callerLabel(incoming)}
            </p>
            {callerSub(incoming) ? (
              <p className="mt-0.5 truncate text-xs text-[var(--so-muted)]">{callerSub(incoming)}</p>
            ) : null}
          </div>
          <button
            type="button"
            aria-label="Dismiss"
            className="rounded-md p-1 text-[var(--so-muted)] hover:bg-[var(--so-surface-hover)]"
            onClick={() => setDismissedId(incoming.id)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-3 flex gap-2">
          <Button
            type="button"
            size="sm"
            className="flex-1"
            disabled={busy}
            onClick={() => void onAnswer()}
            leftIcon={<Phone className="h-3.5 w-3.5" />}
          >
            Answer
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="flex-1"
            disabled={busy}
            onClick={() => void onDecline()}
            leftIcon={<PhoneOff className="h-3.5 w-3.5" />}
          >
            Decline
          </Button>
        </div>
      </div>
    </div>
  );
}
