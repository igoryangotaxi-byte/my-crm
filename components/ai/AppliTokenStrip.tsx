"use client";

import { NOTES_ONBOARDING_HREF, YANGO_TOKEN_ONBOARDING_HREF } from "@/lib/yango-token-health";

export type AppliTokenChip = {
  label: string;
  clientName: string | null;
  status: "live" | "dead" | "empty";
};

export function AppliTokenStrip({
  tokens,
  loading,
  emptyLabel,
  connectLabel,
}: {
  tokens: AppliTokenChip[];
  loading: boolean;
  emptyLabel: string;
  connectLabel: string;
}) {
  if (loading && tokens.length === 0) {
    return <p className="ycds-small px-4 py-2 text-[var(--so-muted)]">…</p>;
  }

  if (tokens.length === 0) {
    return (
      <div className="border-b border-[var(--so-border)] px-4 py-2">
        <p className="ycds-small text-[var(--so-muted)]">{emptyLabel}</p>
        <div className="mt-1 flex flex-wrap gap-2">
          <a
            href={YANGO_TOKEN_ONBOARDING_HREF}
            className="ycds-small text-[var(--so-accent-strong)] underline-offset-2 hover:underline"
          >
            {connectLabel} · Yango
          </a>
          <a
            href={NOTES_ONBOARDING_HREF}
            className="ycds-small text-[var(--so-accent-strong)] underline-offset-2 hover:underline"
          >
            Notes
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-1.5 overflow-x-auto border-b border-[var(--so-border)] px-4 py-2">
      {tokens.map((token) => (
        <span
          key={token.label}
          className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${
            token.status === "live"
              ? "border-[var(--so-border)] text-[var(--so-text)]"
              : "border-[var(--so-border)] text-[var(--so-muted)]"
          }`}
          title={token.clientName ?? token.label}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              token.status === "live" ? "bg-[var(--success)]" : "bg-[var(--so-muted-2)]"
            }`}
            aria-hidden
          />
          {token.label}
          {token.status === "dead" ? " !" : null}
        </span>
      ))}
    </div>
  );
}
