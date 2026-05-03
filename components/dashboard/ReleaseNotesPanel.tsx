type ReleaseItem = {
  date: string;
  title: string;
  notes: string;
};

const releaseItems: ReleaseItem[] = [
  {
    date: "2026-05-03",
    title: "Vercel: force npm install (drop stray pnpm locks) (0.2.8)",
    notes:
      "b8679194 — App version 0.2.8. Removed committed pnpm-lock.yaml and pnpm-workspace.yaml from the Figma merge so Vercel no longer runs pnpm against an incompatible lockfile. Added vercel.json with installCommand npm ci and buildCommand npm run build; package.json engines.node >=20.9.0 for consistent Node on Vercel.",
  },
  {
    date: "2026-05-03",
    title: "Pre-Orders & Communications: compact filter toolbars (0.2.7)",
    notes:
      "a2696dbb — App version 0.2.7. Pre-Orders filter strip uses a flat white toolbar (slate borders, h-9 controls) with calendar icons on From/To dates and a single status pill with colored dots for Assigned vs Unassigned counts. Communications: client select and phone search share the same bordered toolbar row (search + chevron affordances, aligned dropdown), slate-styled suggestion list and recipient chips, consistent channel button height.",
  },
  {
    date: "2026-05-03",
    title: "CRM UI: glass surfaces, layout, Communications & Pre-Orders (0.2.6)",
    notes:
      "7831ab58 — App version 0.2.6. Unified Make-style CRM chrome: AppShell/main spacing, glass sidebar and header, Request Rides full-viewport map padding; Pre-Orders filter strip and Orders/B2B tables aligned to glass cards; Communications panel glass + nested panels; Access management and client portal sections use shared spacing; globals.css glass/Make helpers. Restored my-crm package.json and stopped tracking node_modules accidentally committed on develop. Follow-up 9d19412d removes erroneous Vite-oriented vercel.json so Vercel builds Next correctly.",
  },
  {
    date: "2026-05-03",
    title: "Request Rides: suggests fixed on Vercel (read-only FS) (0.2.5)",
    notes:
      "b1ceec2 — App version 0.2.5. Yango user search called upsertMappedUserId to persist phone→user_id in data/request-rides-user-map.json; on Vercel the filesystem is read-only, the write threw, and the whole searchRequestRideUsers call failed → empty Rider Phone dropdown. writeUserMap errors are now swallowed so suggests complete; local/dev unchanged where the file is writable.",
  },
  {
    date: "2026-05-02",
    title: "Request Rides: Rider Phone suggests work on production (0.2.4)",
    notes:
      "f30736c — App version 0.2.4. Local dev used gitignored request-rides-user-map.json; Vercel prod had no map so CRM operators got empty suggests. /api/request-rides-user-suggest now resolves Yango user_id by phone when the map file is absent; default-select first client for internal CRM so Rider Phone queries always have tokenLabel/clientId.",
  },
  {
    date: "2026-05-01",
    title: "Request Rides: cost center from server only (0.2.3)",
    notes:
      "e8ec286 — App version 0.2.3. CRM Request Rides no longer shows a cost center field; /api/request-rides-create assigns the default via resolveCostCenterWithFullYangoDiscovery (phone, users/cost-centers API, tenant KV, pins). Yango API and onboarding aligned with CORP UUID handling; tenant-yango-bootstrap tests added.",
  },
  {
    date: "2026-05-02",
    title: "Token diagnostics: one card per Yango API token (prod dedupe)",
    notes:
      "dedf741 — Merged static + KV Yango token lists are deduplicated by equal API secret (same token no longer appears as COFIX+SAMELET, Tel Aviv, Yango Deli, TEST+APLI duplicates). COFIX uses only YANGO_TOKEN_COFIX. Notes panel title shows token vs client row counts. Unblocks correct client_id↔token mapping in production.",
  },
  {
    date: "2026-05-02",
    title: "Yango user-list: prefer cost_centers_id UUID over display name",
    notes:
      "739da1f — App version 0.2.2. Per Yandex Business user-list API, cost_centers_id (UUID) is parsed before cost_center (name); directory mapping uses user _id for /2.0/users resolution so DEFAULT_CORP / CRM flows match cabinet CC assignment.",
  },
  {
    date: "2026-05-02",
    title: "Cost center discovery parity + KV ops (all cabinets)",
    notes:
      "9c5590c — App version 0.2.1. Fixed KV dropping pinnedDefaultCostCenterId on load; npm run sync:tenant-cost-centers for prod backfill (dry-run, overrides); Request Rides + auth now use resolveCostCenterWithFullYangoDiscovery — same parallel users + cost_centers API path as onboarding for every client id, not only TEST.",
  },
  {
    date: "2026-05-01",
    title: "Client cabinet cost centers + CRM Request Rides parity",
    notes:
      "74ba55d — App version 0.2.0. Unified Yango tenant cost-center bootstrap (lib/tenant-yango-bootstrap): onboarding requests cost centers API in parallel with employee directory, fills CC on each imported employee, removes hardcoded TEST pin in favor of YANGO_PINNED_COST_CENTER_JSON / KV pinnedDefaultCostCenterId. Auth sync aligned; onboarding warnings in Notes. Request Rides from main CRM resolves tenant defaults from KV by tokenLabel+clientId and returns 400 if CORP cannot get a cost center. Client portal section gate and related Notes/access README updates.",
  },
  {
    date: "2026-04-29",
    title: "Request Rides map interaction hotfix",
    notes:
      "5e7c047 — Fixed non-responsive Request Rides map in production by making the full-screen overlay non-interactive and keeping pointer events only on the left control column, restoring ride preview clicks and drag-to-move point editing.",
  },
  {
    date: "2026-04-29",
    title: "Request Rides production suggest hotfix",
    notes:
      "427eab0 — Fixed Rider Phone employee suggestions in production by adding tenant-level fallback resolution to remote Yango user ids when users/list is empty or restricted, restoring reliable employee selection in client cabinets.",
  },
  {
    date: "2026-04-29",
    title: "Client cabinet onboarding + financial center release",
    notes:
      "afa0ed6 — Added Financial Center (summary + CSV/XLSX export), My Employees activity with tenant/Yango matching, universal employee auto-sync to Yango with cost-center fallback per client cabinet, and Request Rides/client-scope UX fixes including lookup improvements and cabinet-specific header/navigation behavior.",
  },
  {
    date: "2026-04-28",
    title: "Orders pagination + pending route editing",
    notes:
      "Restored Orders behavior to show the latest 20 non-scheduling rides on first open, continue loading by Load more (+20 each click), and added Pending uploads map focus so clicking a pending card shows its route and allows drag-updating points back into the card.",
  },
  {
    date: "2026-04-28",
    title: "Client cabinet MVP foundation",
    notes:
      "In progress — Added tenant-scoped auth schema + KV migration v4, /client portal routes with guarded layout and scoped Orders/Pre-Orders/Request Rides context, tenant-aware API scope enforcement, Employees MVP, and internal onboarding bridge for corp_client_id + tokenLabel/clientId binding.",
  },
  {
    date: "2026-04-27",
    title: "Request Rides default routing and collapsible UX",
    notes:
      "806c8ee — Default app entry moved to Request Rides, B2B/B2C switch now routes to Request Rides/Drivers Map, Request Rides sections became collapsible with hover + chevron state, and B2B CSV local-time parsing was fixed to avoid +3h drift and missing rows.",
  },
  {
    date: "2026-04-25",
    title: "Drivers map: stable markers, Fleet cache, Vercel Fleet env",
    notes:
      "ad2f1c6 — Stable overlap jitter (sort gpsDrivers and buckets by driver id), in-place marker setLngLat/style updates, API lat/lon preferred in merged state. " +
      "96e58c2 — npm run vercel:sync-fleet-env pushes FLEET_* from .env.local to Vercel (production, preview develop, development). " +
      "bbcdb2a — Re-hydrate last-known GPS from observations on cached Fleet paths (24h window, no 10m stale cut-off; hydrate on all snapshot returns).",
  },
  {
    date: "2026-04-25",
    title: "Fleet drivers map and CRM production",
    notes:
      "234c41a — /drivers-map with Yango Fleet + MapLibre, /api/drivers-map and /api/fleet-partners, lib/fleet-api (tracks, geo cache, counters), carry coords after trips, richer profile/track geo parsing, sidebar access; ships with orders, pre-orders, request rides, layout, and type updates.",
  },
  {
    date: "2026-04-25",
    title: "Request Rides map redesign and Pre-orders rows",
    notes:
      "Shipped map-first Request Rides layout with overlay panels, unified dropdown behavior, improved route controls placement, and redesigned Pre-orders into compact 3D rows with direct Order in Adminka action.",
  },
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
