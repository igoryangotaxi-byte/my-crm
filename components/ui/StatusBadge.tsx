type StatusBadgeProps = {
  label: string;
  tone?: "green" | "yellow" | "red" | "blue" | "gray";
};

const toneMap: Record<NonNullable<StatusBadgeProps["tone"]>, string> = {
  green: "bg-white/80 text-emerald-700 border border-emerald-200",
  yellow: "bg-white/80 text-amber-700 border border-amber-200",
  red: "bg-white/80 text-rose-700 border border-rose-200",
  blue: "bg-white/80 text-blue-700 border border-blue-200",
  gray: "bg-white/80 text-slate-700 border border-slate-200",
};

export function StatusBadge({ label, tone = "gray" }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold shadow-[0_6px_14px_rgba(15,23,42,0.1)] ${toneMap[tone]}`}
    >
      {label}
    </span>
  );
}
