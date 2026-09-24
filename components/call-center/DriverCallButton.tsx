"use client";

import { useState, type MouseEvent } from "react";
import Link from "next/link";
import { Phone } from "lucide-react";
import { cn } from "@/lib/ui/cn";
import { Tooltip } from "@/components/ui/Tooltip";
import { normalizeDestinationForThreeCx } from "@/lib/call-center/phone";

export type ClickToCallProvider = "threecx" | "astradial";

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
  entityType?: string;
  entityId?: string;
  /**
   * Independent engines — no cross-fallback.
   * Default `threecx` keeps Call Center Dial unchanged while Astradial is tested.
   */
  provider?: ClickToCallProvider;
};

function isAstradialUiEnabled(): boolean {
  const raw = process.env.NEXT_PUBLIC_TELEPHONY_ENABLED?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function ClickToCallButton({
  phone,
  compact = false,
  className,
  stopPropagation = true,
  emptyReason = "No phone number",
  variant = "dial",
  label,
  entityType,
  entityId,
  provider = "threecx",
}: ClickToCallButtonProps) {
  const trimmed = typeof phone === "string" ? phone.trim() : "";
  const canDial = Boolean(trimmed);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const viaAstradial = provider === "astradial";
  const resolvedLabel = label ?? (viaAstradial ? "Astradial" : "Dial");

  const showHint = (message: string, clearMs = 4000) => {
    setHint(message);
    window.setTimeout(() => setHint(null), clearMs);
  };

  const dialViaThreeCxClick2Call = () => {
    const destination = normalizeDestinationForThreeCx(trimmed);
    if (!destination) {
      showHint("Invalid phone number.");
      return;
    }
    // Bar Oz: outbound Dial uses the 3CX Click2Call Chrome/Edge extension (or desktop app),
    // not Call Control CLIENT_ID/SECRET. tel: is intercepted by that extension.
    window.location.href = `tel:+${destination}`;
    showHint(
      "Opening 3CX dialer… Install “3CX Click2Call” (Chrome/Edge) if FaceTime opens instead.",
      6000,
    );
  };

  const dialViaThreeCx = async () => {
    const res = await fetch("/api/sales-operation/call-center/makecall", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: trimmed }),
    });
    const json = (await res.json()) as { ok?: boolean; error?: string; code?: string };

    if (json.code === "not_linked") {
      // Extension mapping is only for Call Control API; Click2Call does not need it.
      dialViaThreeCxClick2Call();
      return;
    }
    if (res.status === 503) {
      // No THREECX_CLIENT_ID/SECRET on server — use Bar Oz Click2Call path.
      dialViaThreeCxClick2Call();
      return;
    }
    if (!res.ok || !json.ok) {
      showHint(json.error ?? "Call via 3CX failed.");
      return;
    }
    showHint("Calling via 3CX…", 2500);
  };

  const dialViaAstradial = async () => {
    const res = await fetch("/api/telephony/calls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: trimmed,
        entityType: entityType ?? undefined,
        entityId: entityId ?? undefined,
      }),
    });
    const json = (await res.json()) as { ok?: boolean; error?: string; code?: string };

    if (json.code === "telephony_disabled" || json.code === "provider_unavailable") {
      showHint(json.error ?? "Astradial is not configured.");
      return;
    }
    if (json.code === "not_linked") {
      setHint("Link Astradial extension");
      return;
    }
    if (!res.ok || !json.ok) {
      showHint(json.error ?? "Call via Astradial failed.");
      return;
    }
    showHint("Calling via Astradial…", 2500);
  };

  const onCall = async (event: MouseEvent) => {
    if (stopPropagation) event.stopPropagation();
    event.preventDefault();
    if (!canDial) return;
    setBusy(true);
    setHint(null);
    try {
      // Never fall back to tel: — on macOS that opens FaceTime.
      // Engines stay independent: no 3CX ↔ Astradial fallback.
      if (viaAstradial) {
        await dialViaAstradial();
      } else {
        await dialViaThreeCx();
      }
    } catch {
      showHint("Call failed. Check your connection.");
    } finally {
      setBusy(false);
    }
  };

  const tooltip = !canDial
    ? emptyReason
    : hint || (viaAstradial ? "Call via Astradial" : "Call via 3CX");
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

  const linkHint = hint?.includes("Astradial")
    ? { href: "/sales-operation/astradial", label: hint }
    : hint?.includes("Call Center") || hint?.includes("3CX")
      ? { href: "/sales-operation/call-center", label: hint }
      : null;

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
            aria-label={canDial ? resolvedLabel : emptyReason}
            className={btnClass}
          >
            <Phone className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
            {resolvedLabel}
          </button>
        </span>
      </Tooltip>
      {linkHint ? (
        <span className="max-w-[16rem] text-[10px] text-[var(--so-muted)]">
          {linkHint.label}{" "}
          <Link href={linkHint.href} className="text-[var(--so-text)] underline">
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
  const astradialOn = isAstradialUiEnabled();
  const { className, ...rest } = props;

  if (!astradialOn) {
    return (
      <ClickToCallButton
        emptyReason="No phone for this driver"
        variant="dial"
        entityType="driver"
        provider="threecx"
        {...props}
      />
    );
  }

  // Side-by-side for A/B: 3CX Dial + Astradial — no cross-fallback.
  return (
    <span className={cn("inline-flex flex-wrap items-start gap-1.5", className)}>
      <ClickToCallButton
        emptyReason="No phone for this driver"
        variant="dial"
        entityType="driver"
        provider="threecx"
        label="3CX"
        {...rest}
      />
      <ClickToCallButton
        emptyReason="No phone for this driver"
        variant="dial"
        entityType="driver"
        provider="astradial"
        label="Astradial"
        {...rest}
      />
    </span>
  );
}
