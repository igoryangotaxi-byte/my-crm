type ReleaseItem = {
  date: string;
  title: string;
  notes: string;
};

const releaseItems: ReleaseItem[] = [
  {
    date: "2026-04-24",
    title: "Orders table lazy-loading",
    notes:
      "Orders table now renders first 50 rows instantly and loads the rest on demand via a Load more button to improve page responsiveness on large datasets.",
  },
  {
    date: "2026-04-24",
    title: "Dashboard loading and section switcher update",
    notes:
      "Optimized Dashboard initial load to fetch current month data by default, removed All Blocks mode, moved API/Yango switcher into a dedicated top block, and aligned B2B/B2C toggle styling with section bubbles.",
  },
  {
    date: "2026-04-24",
    title: "Request Rides and Orders production release",
    notes:
      "Deployed Request Rides tracking persistence with terminal-status cleanup, Yango order cancellation flow, Orders fixes for Test Cabinet visibility, and updated sidebar/access controls.",
  },
  {
    date: "2026-04-20",
    title: "Greenplum validation mode",
    notes:
      "Added monthly Greenplum vs Supabase validation flow in Notes with progress tracking, mismatch report, and a dedicated local validation script/API endpoint.",
  },
  {
    date: "2026-04-21",
    title: "Dashboard split into API and Yango blocks",
    notes:
      "Added separate API Data and Yango Data sections on Dashboard with three new date-filtered Yango dashboards: completion rate, decoupling trend, and top clients.",
  },
  {
    date: "2026-04-21",
    title: "DataGrip auto-sync scripts",
    notes:
      "Added local scripts for DataGrip DSN discovery, Greenplum connection check, incremental fct_order sync, optional agg_executor sync, and Supabase sync state tracking.",
  },
  {
    date: "2026-04-21",
    title: "DataGrip sync flow",
    notes:
      "Updated Notes sync flow to support DataGrip connection check first, then Greenplum to Supabase sync using dedicated env commands.",
  },
  {
    date: "2026-04-21",
    title: "Supabase integration baseline",
    notes:
      "Connected Supabase env/config in project, added connection status in Notes, and secured Greenplum sync endpoint to run only when Supabase is configured.",
  },
  {
    date: "2026-04-21",
    title: "Greenplum sync button in Notes",
    notes:
      "Added a manual Sync Greenplum -> Supabase action in Notes with a secure local-only API endpoint controlled by environment flags.",
  },
  {
    date: "2026-04-21",
    title: "Expanded Yango token coverage",
    notes:
      "Renamed RydeMobility token mapping to SHANA10 and added TelAvivMunicipality, YangoDeli, and SHLAV tokens across pre-orders, dashboard, orders, and diagnostics.",
  },
  {
    date: "2026-04-21",
    title: "Orders filter and sidebar stability",
    notes:
      "Removed Pending from Orders status filter, restored stable hover sidebar behavior, and moved page subtitles into the top header to eliminate duplicate titles.",
  },
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
          <h3 className="crm-section-title">Release notes</h3>
          <p className="crm-subtitle">What is currently deployed to production</p>
        </div>
        <span className="rounded-full border border-white/70 bg-white/80 px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-[0_8px_16px_rgba(15,23,42,0.1)]">
          Build {releaseRef}
        </span>
      </div>

      <div className="grid gap-2 md:grid-cols-3">
        {releaseItems.map((item) => (
          <article key={`${item.date}-${item.title}`} className="crm-hover-lift rounded-2xl border border-white/70 bg-white/75 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">{item.date}</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{item.title}</p>
            <p className="mt-1 text-xs text-slate-600">{item.notes}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
