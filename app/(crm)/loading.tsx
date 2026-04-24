"use client";

export default function CrmLoading() {
  return (
    <div className="crm-page">
      <section className="glass-surface rounded-3xl p-5">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-44 rounded-lg bg-slate-200/80" />
          <div className="grid gap-3 md:grid-cols-3">
            <div className="h-24 rounded-2xl bg-slate-200/80" />
            <div className="h-24 rounded-2xl bg-slate-200/80" />
            <div className="h-24 rounded-2xl bg-slate-200/80" />
          </div>
          <div className="h-64 rounded-2xl bg-slate-200/70" />
        </div>
        <p className="mt-4 text-xs text-slate-500">Loading dashboard data...</p>
      </section>
    </div>
  );
}
