type ReleaseItem = {
  date: string;
  title: string;
  notes: string;
};

const releaseItems: ReleaseItem[] = [
  {
    date: "2026-07-20",
    title: "Global feedback widget → Telegram (0.2.44)",
    notes:
      "App version 0.2.44. Authenticated users get a floating feedback button (bottom-right) on every screen except login/unsubscribe. Submit title + description → stored in feedback_requests and posted to a Telegram chat with ToDo / In Progress / Done buttons. Status taps update the row, edit the Telegram message, notify the author in-app, and show a badge on the FAB until the author opens the widget. New API: /api/feedback (GET/POST), /api/feedback/seen (POST), /api/telegram/webhook (POST). SQL (applied): supabase_feedback_requests.sql. Env (Vercel Production): TELEGRAM_BOT_TOKEN, TELEGRAM_FEEDBACK_CHAT_ID, TELEGRAM_WEBHOOK_SECRET. Webhook: npm run telegram:set-webhook → https://applitaxi.space/api/telegram/webhook. (f501fc06)",
  },
  {
    date: "2026-07-19",
    title: "Sales Operation: My Space task hub & pipeline stage gates (0.2.43)",
    notes:
      "App version 0.2.43. Two additive workflow upgrades. (1) My Space becomes a full task hub: a new \"Created by Me\" tab alongside My Tasks / Assigned, and clicking any task opens a right-side detail Drawer with an editable result summary, a full activity timeline (create / status / reassign / due / summary / follow-up), a Reassign action (assignee + due + comment, notifies the new owner) and a Create-follow-up action (chained via parent task). The same Drawer opens from a lead's Tasks tab, so there's one editor everywhere. (2) Pipeline stage gates are back and server-enforced — no more optimistic drag-and-drop bounce. Moving a lead forward pre-flights on the server and, if requirements are missing, opens a Stage Gate modal that only asks for what's needed: New→In Progress needs a reachable contact + monthly potential; In Progress→Proposal Sent needs a pricing/proposal; Proposal Sent→Negotiation creates a follow-up task in the same step; Negotiation→Signed needs a contract number or Client ID plus an Account Manager. Backward and Rejected moves stay free; Signed remains terminal. Signing now also orchestrates handover: convert to client + an \"Onboard Client\" task for the owner and a \"First Client Call\" task for the selected Account Manager. Lead Overview gains pricing/proposal, proposal amount, contract number and Corp Client ID fields. New API: /leads/[id]/transition (POST, with preflight + structured 422), /tasks/[id] (GET/PATCH), /tasks/[id]/follow-up (POST), /tasks?scope=created. SQL (applied to Supabase): supabase_sales_task_hub.sql (result_summary, parent_task_id, sales_task_events) and supabase_sales_stage_gates.sql (pricing_proposal, pricing_amount, contract_number, corp_client_id on leads). Backward-compatible; EN/HE translations included. (dfe779f8)",
  },
  {
    date: "2026-07-18",
    title: "Sales Operation: premium redesign, free pipeline moves & config everywhere (0.2.42)",
    notes:
      "App version 0.2.42. A large, additive UX pass over the whole Sales Operation module plus two workflow fixes. (1) Pipeline movement is free again: leads no longer bounce back when dropped into Negotiation/Proposal sent — the blocking \"monthly potential required\" gate was removed, while the safe transitions are kept (no New→Signed/Rejected shortcut, Signed stays terminal). (2) Estimated monthly potential (₪) is now editable where the work happens: inline on each pipeline card (set/edit with optimistic save, toast + rollback on error) and in the lead's Overview panel, not only in the Add-lead dialog. (3) Settings for Pipeline stages and Business segments now drive the whole module: renamed/reordered stages and segments appear consistently on the board, lead detail, activity history, analytics and the automation editor; inactive segments can't be assigned to new leads; a stage that still holds leads stays visible instead of hiding them. (4) Premium 2026 UI refresh across the module — flat surfaces (no glass/gradients), consistent tokens, unified toast + confirm dialogs, page headers with breadcrumbs, richer KPI tiles with sparklines and previous-period deltas, virtualized B2B tables with bulk actions, skeleton/empty states, and accessible focus/keyboard behavior. No existing APIs, routes or data structures were changed; all changes are backward-compatible. (fec39e8c)",
  },
  {
    date: "2026-07-17",
    title: "Sales Operation: KPIs, targets & Team Performance (0.2.41)",
    notes:
      "App version 0.2.41. New KPI/performance layer inspired by Monday CRM, built additively on existing data. (1) Per-manager KPI attribution computed from the pipeline + B2B Overview: signed count, conversion %, leads worked, activities logged, tasks completed, avg cycle days, avg response hours, weighted forecast, GMV and trips. New API: /sales-operation/analytics/kpi (GET). (2) Admin-set targets per manager with a flexible period (month or quarter). New table sales_kpi_targets (applied to Supabase) and API /sales-operation/kpi-targets (GET/POST) + /[id] (DELETE); write requires Settings access, managers can read their own. (3) New admin \"Team Performance\" page (/sales-operation/performance) with an actual-vs-target matrix, inline target editing, attainment % color coding, period switcher and CSV export; and a \"My Scorecard\" section on Manager Analytics showing each manager their own KPIs vs targets. (4) Lifecycle polish: a \"Log\" quick-action on the lead card to record call/meeting/whatsapp activities (feeds activity KPIs), a daily task-due reminder cron (/api/sales-operation/cron/task-reminders, protected by CRON_SECRET) that emits task_due notifications for overdue/soon-due tasks, a default \"my leads\" filter for non-admins on the pipeline board (still switchable), and @mention notifications in notes. No existing endpoints or tables were repurposed.",
  },
  {
    date: "2026-07-17",
    title: "Sales Operation: Clients merged into B2B Client Overview (0.2.40)",
    notes:
      "App version 0.2.40. The standalone Clients section has been removed and its useful parts folded into B2B Client Overview. B2B Client Overview now also shows a \"Signed clients awaiting B2B link\" table for signed pipeline clients that aren't yet tied to a corp client, each linking to its client profile. The client profile card (details, health, notes, B2B performance, recent trips) moved to /sales-operation/b2b-clients/[id]; links from AM Portfolio and Global Search now open it there. The Clients item was dropped from the sidebar. Manager assignment, search and trip metrics remain in B2B Client Overview.",
  },
  {
    date: "2026-07-17",
    title: "Sales pipeline fixes: layout, lead tabs, tasks, inline SMS (0.2.39)",
    notes:
      "App version 0.2.39. Four pipeline fixes: (1) The Pipeline page no longer runs off the screen — the board stays within the viewport and its columns scroll horizontally when they don't all fit. (2) The expanded lead card no longer jumps back to the first tab: background polling used to re-select 'Overview' every few seconds; the card now only re-initializes when you actually open a different lead. (3) New tasks created from a lead now default to being assigned to you, so they show up in My Tasks (you can still reassign). (4) The lead card gains an SMS bubble — a quick-action next to Call/Email/WhatsApp that opens an inline composer to text the lead directly (via the Inforu gateway); sent messages are logged on the lead's Activity timeline. New API: /leads/[id]/sms (POST).",
  },
  {
    date: "2026-07-17",
    title: "Fix: SSO login now completes into the app (0.2.38)",
    notes:
      "App version 0.2.38. Fix for Google SSO: after signing in, the app kept returning to the login page. The client now treats the server session cookie as the source of truth — GET /api/auth returns the authenticated user id and the AuthProvider adopts it — so Google sign-in lands correctly on the dashboard instead of bouncing back to /login.",
  },
  {
    date: "2026-07-17",
    title: "Authentication: Google Workspace SSO — @appli.taxi only (0.2.37)",
    notes:
      "App version 0.2.37. Sign-in is now Google Workspace SSO restricted to @appli.taxi accounts. The login page shows a single \"Sign in with Google\" button; email/password login and self-registration are removed. First sign-in with an @appli.taxi Google account auto-provisions an approved User (ig-kuznetsov@appli.taxi is Admin); personal Gmail and other domains are rejected. Two gates are enforced: the OAuth consent screen should be set to Internal (org-only) and the server re-verifies email_verified plus the workspace domain (hd claim) on every login. The existing admin was migrated to ig-kuznetsov@appli.taxi (Admin retained). New routes: /api/auth/google/start and /api/auth/google/callback. New env: GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, optional GOOGLE_OAUTH_REDIRECT_URI, GOOGLE_WORKSPACE_DOMAIN (default appli.taxi), AUTH_SESSION_SECRET. Requires a Google Cloud OAuth Web client whose authorized redirect URIs include the prod + localhost callback URLs. (2ed9c396)",
  },
  {
    date: "2026-07-17",
    title: "Sales Operation Phase 10: email integration — templates, thread, send (0.2.36)",
    notes:
      "App version 0.2.36. Roadmap Phase 10 (email): each lead now has an Email tab with a full outbound/inbound thread. Compose emails inline, optionally starting from a reusable template; personalization placeholders ({{lead.company}}, {{contact.firstName}}, {{manager.name}}, {{date.today}}, …) are filled in on send. Every message is recorded on the thread with status (Sent / Draft / Failed / Received) and also appears on the lead's Activity timeline. Email templates are managed in Sales Operation → Settings (name, subject, body, language, activate/deactivate). Outbound delivery uses SMTP and is compatible with Google Workspace (SMTP relay / app password) and Microsoft 365 (smtp.office365.com); until SMTP env vars are set, composed messages are saved to the thread as drafts but not delivered. Inbound emails can be attached to a lead via a secured webhook (/api/sales-operation/email/inbound). New API: /leads/[id]/email (GET/POST), /config/email-templates (GET/POST) + /[templateId] (PATCH/DELETE), /email/inbound (POST). SQL (applied to Supabase): supabase_sales_email.sql (templates + messages). New env (optional): SALES_SMTP_HOST/PORT/SECURE/USER/PASSWORD/FROM, SALES_EMAIL_INBOUND_SECRET.",
  },
  {
    date: "2026-07-17",
    title: "Sales Operation Phase 9: data quality — search, dedup, archive, audit (0.2.35)",
    notes:
      "App version 0.2.35. Roadmap Phase 9 (data quality): new global search box in the Sales Operation header that finds leads, clients and contacts by name, company, email or phone and jumps straight to the record. Duplicate detection while adding a lead — matches on email, phone and company (with normalized comparison) are surfaced live in the Add lead dialog so you can open the existing record instead of creating a duplicate. Required fields on creation: a lead now needs a name and at least an email or a phone. Soft archive: leads can be archived (hidden from the active board but kept in history) and restored, instead of only hard delete. Full audit log: every lead create/update/status-change/archive/delete is recorded with actor and a field-level diff; field edits and archive/restore now also appear in the lead's Activity timeline. New API: /sales-operation/search (GET), /leads/[id]/archive (POST/DELETE), /leads/duplicates (GET), /sales-operation/audit (GET). SQL (applied to Supabase): supabase_sales_data_quality.sql (audit log table + archive columns).",
  },
  {
    date: "2026-07-17",
    title: "Sales Operation Phase 8: analytics, reports & CSV export (0.2.34)",
    notes:
      "App version 0.2.34. Roadmap Phase 8 (analytics & reports): the Analytics page now includes a Daily report (new leads, moved forward, signed/rejected today), a pipeline funnel with stage-to-stage conversion, pipeline aging buckets (0–7 / 8–14 / 15–30 / 30+ days) plus average days per stage, win/loss stats (win rate, avg days to win/loss), breakdowns by source and by segment, and a weighted-pipeline forecast grouped by expected close month. CSV export for the funnel, source, segment and forecast tables, and a per-manager CSV export on Manager Analytics. New API: /sales-operation/analytics/report (GET). All metrics are computed deterministically from existing lead data — no SQL changes in this phase.",
  },
  {
    date: "2026-07-17",
    title: "Sales Operation Phase 7: client health, AM portfolio, handover (0.2.33)",
    notes:
      "App version 0.2.33. Roadmap Phase 7 (client success): each signed/B2B client now gets a deterministic health status (New / Healthy / Watch / At risk / Dormant) derived from trip recency, volume and decoupling — shown as a badge with reasons on the client profile. New AM Portfolio page (/sales-operation/portfolio) groups clients by account manager with per-group totals (GMV, trips), a health distribution, and a per-client table (health, trips, GMV, days since last trip) linking back to profiles. Handover on Signed: converting a lead to a client now auto-creates a high-priority onboarding task for the owning manager (due in 3 days), logs the handover on the activity feed, and notifies the owner. New API: /sales-operation/portfolio (GET). No SQL changes in this phase.",
  },
  {
    date: "2026-07-17",
    title: "Sales Operation Phase 6: notifications, automations, stage gates (0.2.32)",
    notes:
      "App version 0.2.32. Roadmap Phase 6 (notifications & automation): new in-app notification bell in the Sales Operation header with unread badge, dropdown, per-item + mark-all-read, polling every 60s. Notifications are generated when a task is assigned to someone, when a lead is assigned to a manager (manually or via automation). Automation editor gains a new Create task action node (title with placeholders, type, priority, due-in-days, assign to lead owner), and the Assign manager action now also notifies the assignee. Stage gate: moving a lead to Proposal sent / Negotiation now requires the estimated monthly potential (₪) to be set (returns 422 with a clear message). New API: /sales-operation/notifications (GET) and /notifications/read (POST). SQL (applied to Supabase): supabase_sales_notifications.sql.",
  },
  {
    date: "2026-07-17",
    title: "Sales Operation Phase 5: tabbed lead card + files (0.2.31)",
    notes:
      "App version 0.2.31. Roadmap Phase 5 (detail card): the lead drawer is now organized into tabs — Overview, Contacts, Activity, Tasks, Files — with a sticky header and quick actions (Call / Email / WhatsApp) built from the lead's phone and email. New Files tab: upload attachments to a private Supabase Storage bucket (sales-attachments, 25MB limit), download via short-lived signed URLs, and delete. New API: /leads/[id]/files (GET/POST multipart) and /files/[fileId] (DELETE). SQL (applied to Supabase): supabase_sales_files.sql (creates the private bucket + sales_files table).",
  },
  {
    date: "2026-07-17",
    title: "Sales Operation Phase 4: tasks, activity feed, My Tasks (0.2.30)",
    notes:
      "App version 0.2.30. Roadmap Phase 4 (tasks & activity): each lead gets tasks / next steps with type (call/email/meeting/whatsapp/to-do), priority, due date and assignee. New Tasks section in the lead sidebar with add/edit/complete/delete plus a mandatory next-step banner when no open task exists. Unified Activity feed on the lead merges manual activities, notes, status changes and task events into one chronological timeline (no backfill needed). New My Tasks page (/sales-operation/tasks) listing your tasks across all leads, grouped by Overdue / Today / Upcoming, with mine/all and open/done/all filters and one-click complete. New API: /leads/[id]/tasks (+[taskId]), /leads/[id]/activity, /sales-operation/tasks. SQL (applied to Supabase): supabase_sales_tasks.sql, supabase_sales_activities.sql.",
  },
  {
    date: "2026-07-17",
    title: "Sales Operation Phase 3: multi-contact model (0.2.29)",
    notes:
      "App version 0.2.29. Roadmap Phase 3 (contacts): each lead now supports multiple contacts with full name, job title, department, email, mobile/office phone, preferred channel, notes, primary and decision-maker flags. New Contacts section in the lead detail sidebar with add/edit/delete, one-click Make primary, and clickable email (mailto:) / phone (tel:) links. Dedup by email + mobile within a lead and a single-primary guarantee are enforced at the DB level. New API: /api/sales-operation/leads/[id]/contacts (GET/POST) and /contacts/[contactId] (PATCH/DELETE). SQL (applied to Supabase): supabase_sales_contacts.sql.",
  },
  {
    date: "2026-07-17",
    title: "Sales Operation Phase 1+2: stages, segments, pipeline UX (0.2.28)",
    notes:
      "App version 0.2.28. Roadmap Phase 1 (foundation): configurable pipeline stages + new Negotiation stage, business segments, richer lead/deal fields (legal name, segment, monthly potential ₪, expected close date, probability, etc.), admin Settings page (/sales-operation/settings), new Admin-only salesSettings permission (permissions v11). Phase 2 (pipeline UX): richer lead cards (company title, contact, potential ₪ + weighted, segment, owner, days in stage), column potential sums, collapsible columns, horizontal scroll for 6 stages, filters (search/owner/segment/campaign/source/potential) with per-user saved views, extended create-lead modal (company/segment/potential/owner). Negotiation degrades gracefully on old DB (in_progress + override). SQL (run in Supabase): supabase_sales_negotiation_status.sql, supabase_sales_pipeline_config.sql (or npm run db:apply:sales-operation).",
  },
  {
    date: "2026-07-10",
    title: "Sales Automation + Clients AM assign (0.2.27)",
    notes:
      "13ecdc8c — App version 0.2.27. Sales Operation Automation canvas (status trigger → SMS + assign manager). Clients list: active B2B since 2026-01-01 + pipeline clients; inline Account Manager dropdown; click opens trips/detail. B2B trips under /sales-operation/b2b-clients/trips. Pipeline first-touch Sales Manager. SQL: supabase_sales_automation.sql, supabase_list_active_corp_clients.sql (run in Supabase).",
  },
  {
    date: "2026-07-10",
    title: "Sales Operation CRM + Gett removal (0.2.26)",
    notes:
      "0a83da7a — App version 0.2.26. New Sales Operation module: pipeline, clients, B2B registry, analytics, WordPress form webhook. Removed Gett. Access delete removes Auth + profile. proposal_sent works without DB constraint change (compat). Faster clients list. SQL: supabase_sales_operation*.sql, supabase_b2b_client_managers.sql, supabase_auth_roles_account_sales_managers.sql.",
  },
  {
    date: "2026-07-06",
    title: "Unsubscribe page Yango Headline font (0.2.25)",
    notes:
      "08beeb5c — App version 0.2.25. /unsubscribe: Yango Headline font, simplified animations (taxi removed), standalone public landing at applitaxi.space/unsubscribe.",
  },
  {
    date: "2026-05-27",
    title: "Unsubscribe landing page (0.2.24)",
    notes:
      "8fa937dc — App version 0.2.24. Public /unsubscribe page: white Yango-style landing with animated green checkmark and Hebrew title (ההרשמה בוטלה), no auth required.",
  },
  {
    date: "2026-05-27",
    title: "Price Calculator compare table and problematic insights (0.2.23)",
    notes:
      "cf55e944 — App version 0.2.23. Price Calculator Compare: Detailed rides adds order_id, excludes No price rows, sortable columns without reloading charts; removed P90/P95/Anomalies KPI cards; Top problematic hours/weekdays split into Mone price higher vs Driver price higher (>₪10), with block descriptions.",
  },
  {
    date: "2026-05-25",
    title: "Yango Data GP trip upload + segmented dashboard tabs (0.2.22)",
    notes:
      "d47abc70 — App version 0.2.22. Dashboards Yango Data: Upload Data button imports GP trip CSV into gp_fct_order_raw (dedupe by order_id, insert-only), shows added/unique/duplicate stats modal, refreshes client table. API Data / Yango Data switcher matches Price Calculator segmented tabs. Shared lib/gp-trips-import for UI API and npm run import:b2b:csv.",
  },
  {
    date: "2026-05-24",
    title: "Price Calculator driver vs mone comparison (0.2.21)",
    notes:
      "19656e04 — App version 0.2.21. Price Calculator Compare tab: import taxitariff.co.il mone prices (CSV/XLSX), match to CRM GP orders by order_id, driver price comparison dashboard (KPIs, charts, filters, export). Unsuccessful trips (0 km / 0 min / 0 driver price) use No price flag and are excluded from analytics. SQL schema in scripts/sql/supabase_driver_price_comparison.sql; optional localhost schema apply route. B2B CSV import skips duplicate order_id rows.",
  },
  {
    date: "2026-05-14",
    title: "Yango Data client trips drilldown + CRM row hover (0.2.20)",
    notes:
      "157db734 — App version 0.2.20. Dashboards -> Yango Data client rows now open a dedicated CRM tab with that client and the currently selected period prefilled, using the same Supabase-backed Yango metrics as the dashboard. Added the new /dashboard/yango-client-trips page, range-aware client filtering in Yango Supabase metrics, preserved corp-admin as a secondary link, and upgraded the Yango client table rows to the standard CRM hover-lift interaction.",
  },
  {
    date: "2026-05-13",
    title: "CRM auth fallback login hotfix",
    notes:
      "bbac22a5 — Fixed the Supabase Auth metadata fallback so default-admin refresh no longer breaks verifier loads. Newly registered pending users and admin-created approved users now persist and authenticate correctly in production.",
  },
  {
    date: "2026-05-13",
    title: "CRM registration moved onto Supabase Auth fallback",
    notes:
      "5755d51f — Production auth no longer waits on missing crm_* Supabase tables or exhausted KV requests for the core CRM user flow. New registrations and Main CRM user creation now persist through Supabase Auth metadata, login still checks Supabase credentials, and platform access remains blocked until an admin approves the user.",
  },
  {
    date: "2026-05-13",
    title: "Mind Map boards + CRM auth rollout safeguards",
    notes:
      "d2cb27b1 — Added the Notes Mind Map workspace with board CRUD, attachments, link previews, and React Flow editing. Also shipped the new Main CRM Users inline create flow and Supabase auth migration groundwork, while keeping production safe with a backward-compatible KV fallback until Supabase runtime env/schema are fully ready.",
  },
  {
    date: "2026-05-10",
    title: "Notes Mind Map (React Flow whiteboards)",
    notes:
      "Mind Map subsection under Notes at /notes/mind-map: Supabase table mind_maps + optional Storage bucket mind-map-files, APIs for CRUD/upload/signed previews, React Flow canvas with colored blocks, sticky notes, link nodes with in-app iframe preview + open-in-tab, file attachments with image/PDF upload, autosave and EN/HE copy.",
  },
  {
    date: "2026-05-08",
    title: "Heat Map demand UX + branches CSV, Gett/API/auth rollup release",
    notes:
      "a88e97bd — Production rollout with B2C Heat Map section (time filtering modes, MapLibre heat layer, overlay controls), branch CSV upload and map markers with hover details, role/navigation/i18n updates, Supabase heatmap ingestion plumbing, plus accumulated Gett/API/auth and docs updates included in this release.",
  },
  {
    date: "2026-05-06",
    title: "Gett CRM section, Price Calculator transcripts, Pre-Orders map (0.2.18)",
    notes:
      "64c1b99c — App version 0.2.18. Gett Business API integration: /gett/* (Request Rides quote/order flow, orders by period, business center), server routes under /api/gett/*, lib/gett-api.ts (Business vs Demand OAuth, businessId from JWT/bundle), diagnostics script gett:business-id. Price Calculator: transcript tariff APIs, XLSX/MOT rules, decoupling suggestions, extended EN/HE copy. Pre-Orders: map view and board updates. Sidebar logo entry to Gett; Communications and Request Rides tweaks; Google Routes/geocoding helpers. Tests for Gett and transcript flows.",
  },
  {
    date: "2026-05-05",
    title: "EN/HE language switch, RTL fixes, and IL phone normalization (0.2.17)",
    notes:
      "343fcbb0 — App version 0.2.17. Added next-intl runtime with EN/HE dictionaries and user language persisted server-side in auth profile. Header now supports language switching and layout mirrors for RTL, with Request Rides/communications/business-center/login coverage expanded for Hebrew. Request Rides also normalizes Israeli rider phone input (e.g., 534895012 or 0534895012) into 972 format for lookup/create/order flows.",
  },
  {
    date: "2026-05-05",
    title: "Bussiness Center + Orders modal cancellation (0.2.16)",
    notes:
      "fa36ca3d — App version 0.2.16. Added main CRM Bussiness Center with client selector, summary/export APIs, and Supabase-backed cache layer (with in-memory fallback) so repeated filter ranges avoid hitting Yango every time. Client cabinet label and page copy switched from Financial Center to Bussiness Center while staying tenant-scoped. Orders modal now shows Cancel in Yango for cancellable statuses only and updates status in UI after successful cancel.",
  },
  {
    date: "2026-05-05",
    title: "Request Rides: Rider phone placement, SMS recipients, original address language (0.2.15)",
    notes:
      "5cb6c705 — App version 0.2.15. Request Rides: Rider Phone moved under Pickup location; immediate/bulk request_created SMS recipients always include Rider Phone with dedupe; driver_on_way continues on the same recipient set. Added request-rides address snapshot storage for new rides and Orders/Pre-Orders now prefer stored original source/destination text (language-preserving), with fallback to Yango fullname. Address/phone inputs in route section were made more visually prominent while keeping CRM style.",
  },
  {
    date: "2026-05-04",
    title: "Communications UI: RR-style client dropdown + segmented tabs (0.2.14)",
    notes:
      "d2a6f7d7 — App version 0.2.14. Communications (main): Bulk SMS / Order Updates tabs use a neutral segmented control (light track, white selected pill, non-red hovers). Client combobox matches Request Rides—rr-make-panel-dropdown-trigger, portal-fixed menu with rr-dropdown-panel / rr-dropdown-option, scroll/resize sync. Default client remains Select Client; empty copy in Order Updates aligned.",
  },
  {
    date: "2026-05-04",
    title: "Communications: Order Updates SMS templates + test send (0.2.13)",
    notes:
      "c976cfbb — App version 0.2.13. Communications: new Order Updates tab (main CRM only)—per API client (tokenLabel + clientId) editable SMS for preorder, immediate ride, and driver-on-way; defaults match Request Rides; KV store appli:order-sms-templates:v1; GET/PUT /api/order-sms-templates with change history; Test modal sends preview via /api/sms/send (communications). Request Rides loads merged templates per client. SMS skip reason clarifies Vercel/.env.local and redeploy. .env.example comment for INFORU_SMS_ENABLED.",
  },
  {
    date: "2026-05-04",
    title: "Request Rides: create rider in Yango + corp CC pairing (0.2.12)",
    notes:
      "d1916b15 — App version 0.2.12. Rider phone suggest: optional Create in Yango cabinet with Full name; POST /api/request-rides-user-ensure. Yango user create uses Israeli 972 phone normalization, POST /2.0/users only, cost center IDs from listYangoCostCenters resolved per same corp client id as header (fixes cost_centers_id validation); yangoCorpClientIdProbeOrder across suggest/resolve/ensure. Suggest popover ref keeps panel open when focusing Full name. Parser-safe cc helpers.",
  },
  {
    date: "2026-05-04",
    title: "Request Rides Yango + VIPLuxTravel & IFA cabinets (0.2.11)",
    notes:
      "0d4016dd — App version 0.2.11. Request Rides: CORP cost center fields on orders/create when UUID resolves; client id for Yango matches lookup (no forced dashed header); phone→user_id map accepts dashed/undashed client_id keys; optional REQUEST_RIDES_CC_DEBUG; invalid CC labels cleared instead of blocking create. Static cabinets VIPLuxTravel (YANGO_TOKEN_VIP_LUX_TRAVEL) and IFA (YANGO_TOKEN_IFA), sync-yango-env-tokens-to-kv + Vercel env scripts. suggest route normalizes client id scope. UI updates on Request Rides page; trace fields on create errors.",
  },
  {
    date: "2026-05-03",
    title: "Sidebar: logo squircle aligned with nav icons (0.2.10)",
    notes:
      "c85b4ee7 — App version 0.2.10. Branding row matches nav Link layout: same horizontal padding (pl-1.5 pr-1.5), justify-center when the rail is narrow, and the same group-hover spacing so the top dashboard icon lines up with the squircles below.",
  },
  {
    date: "2026-05-03",
    title: "Request Rides: wider column, requested-ride cards UX (0.2.9)",
    notes:
      "6f6d7acd — App version 0.2.9. Request Rides left column wider (36rem), lighter frosted shell over map; map fit padding updated. Requested rides cards: staggered entrance, smooth accordion expand, hover lift; closed cards translucent with blur, solid opaque panel when opened. PostCSS Tailwind plugin restore remains from earlier commit.",
  },
  {
    date: "2026-05-03",
    title: "Vercel: force npm install (drop stray pnpm locks) (0.2.8)",
    notes:
      "87a81a52 — App version 0.2.8. Removed committed pnpm-lock.yaml and pnpm-workspace.yaml from the Figma merge so Vercel no longer runs pnpm against an incompatible lockfile. Added vercel.json with installCommand npm ci and buildCommand npm run build; package.json engines.node >=20.9.0 for consistent Node on Vercel.",
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
