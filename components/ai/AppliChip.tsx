"use client";

export type AppliChipState = "idle" | "thinking" | "needs-confirm" | "token-dead";

export function AppliChip({
  state,
  label,
  confirmCount,
  onClick,
}: {
  state: AppliChipState;
  label: string;
  confirmCount: number;
  onClick: () => void;
}) {
  const thinking = state === "thinking";
  const needsConfirm = state === "needs-confirm";
  const tokenDead = state === "token-dead";

  return (
    <button
      type="button"
      onClick={onClick}
      data-appli-state={state}
      className={`so-focus-ring relative inline-flex h-9 items-center gap-1.5 rounded-[8px] border px-2.5 text-sm transition-colors ${
        thinking
          ? "appli-chip-thinking border-[var(--so-accent)] text-[var(--so-accent-strong)]"
          : needsConfirm
            ? "border-[var(--so-border-strong)] text-[var(--so-text)] hover:bg-[var(--so-surface-hover)]"
            : tokenDead
              ? "border-[var(--so-border)] text-[var(--so-muted)] hover:bg-[var(--so-surface-hover)]"
              : "border-[var(--so-border)] text-[var(--so-muted)] hover:bg-[var(--so-surface-hover)] hover:text-[var(--so-text)]"
      }`}
      aria-label={label}
    >
      <span className="hidden sm:inline">{label}</span>
      <span className="sm:hidden">A</span>
      {needsConfirm && confirmCount > 0 ? (
        <span
          className="inline-flex min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-medium leading-4 text-white"
          style={{ backgroundColor: "#FF2D2D" }}
        >
          {confirmCount > 9 ? "9+" : confirmCount}
        </span>
      ) : null}
      {tokenDead ? (
        <span className="text-[var(--so-muted)]" aria-hidden>
          !
        </span>
      ) : null}
    </button>
  );
}
