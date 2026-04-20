type ReleaseItem = {
  date: string;
  title: string;
  notes: string;
};

const releaseItems: ReleaseItem[] = [
  {
    date: "2026-04-20",
    title: "Dashboard charts refresh",
    notes:
      "Unified light dashboard cards, added adaptive chart density, and improved hover tooltips.",
  },
  {
    date: "2026-04-20",
    title: "Security hardening",
    notes:
      "Moved Yango API tokens to environment variables and removed embedded secrets from source code.",
  },
  {
    date: "2026-04-20",
    title: "Auth and access updates",
    notes:
      "Enabled role-based access management with pending registration approval flow in Accesses.",
  },
];

export function ReleaseNotesPanel() {
  const commitSha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7);
  const releaseRef = commitSha ? `#${commitSha}` : "local";

  return (
    <section className="glass-surface mb-4 rounded-3xl p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Release notes</h3>
          <p className="text-sm text-muted">What is currently deployed to production</p>
        </div>
        <span className="rounded-full border border-border bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">
          Build {releaseRef}
        </span>
      </div>

      <div className="grid gap-2 md:grid-cols-3">
        {releaseItems.map((item) => (
          <article key={`${item.date}-${item.title}`} className="rounded-2xl border border-border bg-white p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">{item.date}</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{item.title}</p>
            <p className="mt-1 text-xs text-slate-600">{item.notes}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
