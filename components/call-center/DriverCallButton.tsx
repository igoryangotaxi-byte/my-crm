"use client";

import { useState, type MouseEvent } from "react";
import Link from "next/link";
import { Check, Copy, Phone } from "lucide-react";
import { cn } from "@/lib/ui/cn";

type DriverCallButtonProps = {
  phone: string | null | undefined;
  /** compact = denser table/map layout */
  compact?: boolean;
  className?: string;
  stopPropagation?: boolean;
};

export function DriverCallButton({
  phone,
  compact = false,
  className,
  stopPropagation = true,
}: DriverCallButtonProps) {
  const trimmed = typeof phone === "string" ? phone.trim() : "";
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  if (!trimmed) return null;

  const iconBtn =
    "inline-flex shrink-0 items-center justify-center rounded-md border border-[var(--so-border)] bg-[var(--so-surface)] text-[var(--so-text)] transition-colors hover:bg-[var(--so-surface-hover)] disabled:opacity-60";

  const onCopy = async (event: MouseEvent) => {
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
    window.location.href = `tel:${trimmed}`;
  };

  const onCall = async (event: MouseEvent) => {
    if (stopPropagation) event.stopPropagation();
    event.preventDefault();
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
        return;
      }

      if (!res.ok || !json.ok) {
        if (json.code === "not_linked") {
          setHint("Link 3CX in Call Center");
        } else {
          // Prefer device dialer over a dead-end error when PBX fails.
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

  return (
    <span
      className={cn("inline-flex flex-col items-start gap-0.5", className)}
      onClick={stopPropagation ? (e) => e.stopPropagation() : undefined}
    >
      <span className="inline-flex items-center gap-1.5">
        <span
          className={cn(
            "font-medium text-[var(--so-text)] tabular-nums",
            compact ? "text-xs" : "text-sm",
          )}
        >
          {trimmed}
        </span>
        <button
          type="button"
          onClick={(e) => void onCopy(e)}
          title="Copy"
          aria-label="Copy phone"
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
          disabled={busy}
          title="Call"
          aria-label="Call phone"
          className={cn(iconBtn, compact ? "h-6 w-6" : "h-7 w-7")}
        >
          <Phone className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
        </button>
      </span>
      {hint ? (
        <span className="max-w-[16rem] text-[10px] text-[var(--so-muted)]">
          {hint}
          {hint.includes("Call Center") ? (
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
