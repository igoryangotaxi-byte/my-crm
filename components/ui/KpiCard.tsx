type KpiCardProps = {
  label: string;
  value: string;
  trend: string;
};

export function KpiCard({ label, value, trend }: KpiCardProps) {
  return (
    <article className="rounded-2xl border border-border bg-panel p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold text-foreground">{value}</p>
      <p className="mt-2 inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
        {trend}
      </p>
    </article>
  );
}
