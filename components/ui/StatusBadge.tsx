type StatusBadgeProps = {
  label: string;
  tone?: "green" | "yellow" | "red" | "blue" | "gray";
};

const toneMap: Record<NonNullable<StatusBadgeProps["tone"]>, string> = {
  green: "bg-emerald-100 text-emerald-700",
  yellow: "bg-amber-100 text-amber-700",
  red: "bg-rose-100 text-rose-700",
  blue: "bg-blue-100 text-blue-700",
  gray: "bg-slate-100 text-slate-700",
};

export function StatusBadge({ label, tone = "gray" }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${toneMap[tone]}`}
    >
      {label}
    </span>
  );
}
