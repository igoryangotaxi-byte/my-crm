/** Linear-style segmented control. Used by Communications + Price Calculator + Pre-orders. */
export const segmentedTabTrackClass =
  "mb-4 flex gap-0.5 rounded-[8px] border border-[var(--so-border)] bg-[var(--so-surface-2)] p-0.5";

export const segmentedTabSelectedClass =
  "relative z-[1] rounded-[6px] border border-[var(--so-border)] bg-[var(--so-surface)] text-[var(--so-text)] shadow-[var(--so-shadow-xs)] " +
  "focus-visible:outline-none focus-visible:shadow-[var(--so-focus-ring)]";

export const segmentedTabInactiveClass =
  "rounded-[6px] border border-transparent bg-transparent text-[var(--so-muted)] " +
  "transition-[background-color,color] duration-150 ease-out " +
  "hover:bg-[var(--so-surface)] hover:text-[var(--so-text)] " +
  "focus-visible:outline-none focus-visible:shadow-[var(--so-focus-ring)]";
