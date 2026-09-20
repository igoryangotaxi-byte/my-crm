"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/ui/cn";

type Props = {
  disabled?: boolean;
  disabledReason?: string | null;
};

export function AstradialDialer({ disabled, disabledReason }: Props) {
  const [phone, setPhone] = useState("");
  const [calling, setCalling] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dial = async () => {
    setCalling(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/telephony/calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim() }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        code?: string;
        call?: { id?: string };
      };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Call failed.");
        return;
      }
      setMessage(json.call?.id ? `Call started (${json.call.id.slice(0, 8)}…).` : "Call started.");
    } catch {
      setError("Network error while dialing.");
    } finally {
      setCalling(false);
    }
  };

  return (
    <section className="so-card space-y-3 p-5">
      <div>
        <h3 className="ycds-h3 text-[var(--so-text)]">Dial any number</h3>
        <p className="mt-1 text-sm text-[var(--so-muted)]">
          Rings your linked extension first, then dials the destination via Astradial.
        </p>
      </div>
      <label className="grid gap-1.5 text-sm">
        <span className="text-[var(--so-muted)]">Phone</span>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && phone.trim() && !disabled && !calling) void dial();
          }}
          placeholder="05X… or +972…"
          className="h-9 rounded-[8px] border border-[var(--so-border-strong)] bg-[var(--so-surface)] px-3 text-[var(--so-text)] outline-none focus:border-[var(--so-accent)]"
          inputMode="tel"
          autoComplete="tel"
          disabled={Boolean(disabled) || calling}
        />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          onClick={() => void dial()}
          disabled={Boolean(disabled) || calling || !phone.trim()}
          loading={calling}
        >
          Dial
        </Button>
        {disabled && disabledReason ? (
          <span className="text-xs text-[var(--so-muted)]">{disabledReason}</span>
        ) : null}
      </div>
      {message ? <p className="text-sm text-[var(--so-text)]">{message}</p> : null}
      {error ? <p className={cn("text-sm text-[var(--destructive)]")}>{error}</p> : null}
    </section>
  );
}
