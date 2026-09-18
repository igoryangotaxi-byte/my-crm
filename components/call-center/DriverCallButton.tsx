"use client";

import { useState, type MouseEvent } from "react";
import Link from "next/link";
import { Check, Copy, Phone } from "lucide-react";
import { cn } from "@/lib/ui/cn";

export type ClickToCallButtonProps = {
  phone: string | null | undefined;
  /** compact = denser table/map layout */
  compact?: boolean;
  className?: string;
  stopPropagation?: boolean;
  /** Shown when the entity has no dialable number. */
  emptyReason?: string;
  /** icons = number + copy + call; pill = single Call button (pipeline/quick actions). */
  variant?: "icons" | "pill";
  pillLabel?: string;
  hideNumber?: boolean;
};

export function ClickToCallButton({
  phone,
  compact = false,
  className,
  stopPropagation = true,
  emptyReason = "No phone number",
  variant = "icons",
  pillLabel = "Call",
  hideNumber = false,
}: ClickToCallButtonProps) {
  const trimmed = typeof phone === "string" ? phone.trim() : "";
  const canDial = Boolean(trimmed);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const iconBtn =
    "inline-flex shrink-0 items-center justify-center rounded-md border border-[var(--so-border)] bg-[var(--so-surface)] text-[var(--so-text)] transition-colors hover:bg-[var(--so-surface-hover)] disabled:cursor-not-allowed disabled:opacity-50";

  const onCopy = async (event: MouseEvent) => {
    if (!canDial) return;
    if (stopPropagation) event.stopPropagation();
    event.preventDefault();
    try {
      await navigator.clipboard.writeText(trimmed);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setHint("Copy failed");
    }
  };

  const openDeviceDialer = () => {
    if (!trimmed) return;
    window.location.href = `tel:${trimmed}`;
  };

  const onCall = async (event: MouseEvent) => {
    if (stopPropagation) event.stopPropagation();
    event.preventDefault();
    if (!canDial) return;
    setBusy(true);
    setHint(null);
    try {
      const res = await fetch("/api/sales-operation/call-center/makecall", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: trimmed }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; code?: string };

      // No PBX / not linked → fall back to device dialer silently.
      if (res.status === 503 || json.code === "not_linked") {
        openDeviceDialer();
        if (json.code === "not_linked") {
          setHint("Link 3CX in Call Center");
        }
        return;
      }

      if (!res.ok || !json.ok) {
        if (json.code === "not_linked") {
          setHint("Link 3CX in Call Center");
        } else {
          openDeviceDialer();
          setHint(json.error ?? null);
          window.setTimeout(() => setHint(null), 3000);
        }
        return;
      }
      setHint("Calling via 3CX…");
      window.setTimeout(() => setHint(null), 2500);
    } catch {
      openDeviceDialer();
    } finally {
      setBusy(false);
    }
  };

  const reason = hint || (!canDial ? emptyReason : null);

  if (variant === "pill") {
    return (
      <span
        className={cn("inline-flex flex-col items-start gap-0.5", className)}
        onClick={stopPropagation ? (e) => e.stopPropagation() : undefined}
      >
        <button
          type="button"
          onClick={(e) => void onCall(e)}
          disabled={busy || !canDial}
          title={canDial ? "Call via 3CX" : emptyReason}
          aria-label={canDial ? pillLabel : emptyReason}
          className={cn(
            "so-focus-ring inline-flex items-center gap-1.5 rounded-[9px] border px-2.5 py-1.5 text-xs font-semibold transition-colors",
            canDial
              ? "border-[var(--so-border-strong)] text-[var(--so-text)] hover:bg-[var(--so-surface-hover)]"
              : "cursor-not-allowed border-[var(--so-border)] text-[var(--so-muted-2)]",
          )}
        >
          <Phone className="h-3.5 w-3.5" />
          {pillLabel}
        </button>
        {reason ? (
          <span className="max-w-[16rem] text-[10px] text-[var(--so-muted)]">
            {reason}
            {hint?.includes("Call Center") ? (
              <>
                {" "}
                <Link href="/sales-operation/call-center" className="text-sky-700 underline">
                  Open
                </Link>
              </>
            ) : null}
          </span>
        ) : null}
      </span>
    );
  }

  return (
    <span
      className={cn("inline-flex flex-col items-start gap-0.5", className)}
      onClick={stopPropagation ? (e) => e.stopPropagation() : undefined}
    >
      <span className="inline-flex items-center gap-1.5">
        {!hideNumber ? (
          <span
            className={cn(
              "font-medium tabular-nums",
              compact ? "text-xs" : "text-sm",
              canDial ? "text-[var(--so-text)]" : "text-[var(--so-muted)]",
            )}
          >
            {canDial ? trimmed : "—"}
          </span>
        ) : null}
        <button
          type="button"
          onClick={(e) => void onCopy(e)}
          disabled={!canDial}
          title={canDial ? "Copy" : emptyReason}
          aria-label={canDial ? "Copy phone" : emptyReason}
          className={cn(iconBtn, compact ? "h-6 w-6" : "h-7 w-7")}
        >
          {copied ? (
            <Check className={compact ? "h-3 w-3 text-emerald-600" : "h-3.5 w-3.5 text-emerald-600"} />
          ) : (
            <Copy className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
          )}
        </button>
        <button
          type="button"
          onClick={(e) => void onCall(e)}
          disabled={busy || !canDial}
          title={canDial ? "Call via 3CX" : emptyReason}
          aria-label={canDial ? "Call phone" : emptyReason}
          className={cn(iconBtn, compact ? "h-6 w-6" : "h-7 w-7")}
        >
          <Phone className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
        </button>
      </span>
      {reason ? (
        <span className="max-w-[16rem] text-[10px] text-[var(--so-muted)]">
          {reason}
          {hint?.includes("Call Center") ? (
            <>
              {" "}
              <Link href="/sales-operation/call-center" className="text-sky-700 underline">
                Open
              </Link>
            </>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}

/** Assigned-driver click-to-call. Empty phone stays visible and disabled. */
export function DriverCallButton(props: ClickToCallButtonProps) {
  return <ClickToCallButton emptyReason="No phone for this driver" {...props} />;
}
