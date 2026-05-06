/** Segmented control: raised white pill (active), flat label on track (inactive). Used by Communications + Price Calculator. */
export const segmentedTabTrackClass =
  "mb-4 flex gap-0.5 rounded-2xl border border-slate-200/70 bg-gradient-to-b from-slate-100/95 to-slate-200/75 p-1 shadow-[inset_0_1px_1px_rgba(255,255,255,0.65),0_4px_18px_rgba(15,23,42,0.05)]";

export const segmentedTabSelectedClass =
  "relative z-[1] bg-white text-slate-900 " +
  "border border-white/90 shadow-[inset_0_1px_0_rgba(255,255,255,1),0_4px_14px_rgba(15,23,42,0.07),0_10px_28px_rgba(15,23,42,0.06)] " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/40 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-100/80";

export const segmentedTabInactiveClass =
  "text-slate-700 bg-transparent border border-transparent " +
  "transition-[transform,box-shadow,background-color,color] duration-200 [transition-timing-function:var(--ease-ui)] " +
  "hover:bg-white/75 hover:text-slate-900 hover:shadow-[0_6px_18px_rgba(15,23,42,0.1)] hover:-translate-y-px " +
  "active:translate-y-0 active:shadow-[0_2px_10px_rgba(15,23,42,0.07)] " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/40 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-100/80";
