type StatusBadgeProps = {
  label: string;
  tone?: "green" | "yellow" | "red" | "blue" | "gray";
  compact?: boolean;
  title?: string;
};

const toneMap: Record<NonNullable<StatusBadgeProps["tone"]>, string> = {
  green: "bg-white/80 text-emerald-700 border border-emerald-200",
  yellow: "bg-white/80 text-amber-700 border border-amber-200",
  red: "bg-white/80 text-rose-700 border border-rose-200",
  blue: "bg-white/80 text-blue-700 border border-blue-200",
  gray: "bg-white/80 text-slate-700 border border-slate-200",
};

export function StatusBadge({ label, tone = "gray", compact = false, title }: StatusBadgeProps) {
  return (
    <span
      title={title}
      className={`inline-flex max-w-full rounded-full font-semibold shadow-[0_6px_14px_rgba(15,23,42,0.1)] ${toneMap[tone]} ${
        compact
          ? "px-1.5 py-0.5 text-[0.625rem] leading-tight whitespace-normal text-center"
          : "px-2.5 py-1 text-xs"
      }`}
    >
      {label}
    </span>
  );
}
