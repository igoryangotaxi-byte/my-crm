type KpiCardProps = {
  label: string;
  value: string;
  trend: string;
};

export function KpiCard({ label, value, trend }: KpiCardProps) {
  return (
    <article className="glass-surface crm-hover-lift rounded-2xl p-4">
      <p className="crm-subtitle">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold text-foreground">{value}</p>
      <p className="mt-2 inline-flex rounded-full border border-white/70 bg-white/75 px-2.5 py-1 text-xs font-semibold text-emerald-700 shadow-[0_6px_14px_rgba(15,23,42,0.1)]">
        {trend}
      </p>
    </article>
  );
}
