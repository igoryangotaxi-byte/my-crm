"use client";

import { useState, type MouseEvent } from "react";
import Link from "next/link";
import { Phone } from "lucide-react";
import { cn } from "@/lib/ui/cn";
import { Tooltip } from "@/components/ui/Tooltip";

export type ClickToCallButtonProps = {
  phone: string | null | undefined;
  /** compact = denser table/map layout */
  compact?: boolean;
  className?: string;
  stopPropagation?: boolean;
  /** Shown when the entity has no dialable number. */
  emptyReason?: string;
  /**
   * dial = outline Dial on cards (not red).
   * dialPrimary = crm-button-primary Dial in screen-pop only.
   * pill = compact outline (pipeline quick actions).
   */
  variant?: "dial" | "dialPrimary" | "pill";
  label?: string;
};

export function ClickToCallButton({
  phone,
  compact = false,
  className,
  stopPropagation = true,
  emptyReason = "No phone number",
  variant = "dial",
  label = "Dial",
}: ClickToCallButtonProps) {
  const trimmed = typeof phone === "string" ? phone.trim() : "";
  const canDial = Boolean(trimmed);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

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

      if (res.status === 503 || json.code === "not_linked") {
        openDeviceDialer();
        if (json.code === "not_linked") setHint("Link 3CX in Call Center");
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

  const tooltip = !canDial ? emptyReason : hint || "Call via 3CX";
  const primary = variant === "dialPrimary";
  const btnClass = primary
    ? cn(
        "crm-button-primary inline-flex h-8 items-center justify-center gap-1.5 rounded-[8px] px-3 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50",
        compact && "h-7 px-2.5",
      )
    : cn(
        "so-focus-ring inline-flex items-center justify-center gap-1.5 rounded-[8px] border text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        compact ? "h-7 px-2.5" : "h-8 px-3",
        canDial
          ? "border-[var(--so-border-strong)] bg-[var(--so-surface)] text-[var(--so-text)] hover:bg-[var(--so-surface-hover)]"
          : "border-[var(--so-border)] bg-[var(--so-surface)] text-[var(--so-muted-2)]",
      );

  return (
    <span
      className={cn("inline-flex flex-col items-start gap-0.5", className)}
      onClick={stopPropagation ? (e) => e.stopPropagation() : undefined}
    >
      <Tooltip content={tooltip}>
        <span className="inline-flex">
          <button
            type="button"
            onClick={(e) => void onCall(e)}
            disabled={busy || !canDial}
            aria-label={canDial ? label : emptyReason}
            className={btnClass}
          >
            <Phone className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
            {label}
          </button>
        </span>
      </Tooltip>
      {hint?.includes("Call Center") ? (
        <span className="max-w-[16rem] text-[10px] text-[var(--so-muted)]">
          {hint}{" "}
          <Link href="/sales-operation/call-center" className="text-[var(--so-text)] underline">
            Open
          </Link>
        </span>
      ) : hint && canDial ? (
        <span className="text-[10px] text-[var(--so-muted)]">{hint}</span>
      ) : null}
    </span>
  );
}

/** Assigned-driver click-to-call. Empty phone stays visible and disabled. */
export function DriverCallButton(props: ClickToCallButtonProps) {
  return <ClickToCallButton emptyReason="No phone for this driver" variant="dial" {...props} />;
}
