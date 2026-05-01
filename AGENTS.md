<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Localhost = Production (tokens + Supabase)

When the user needs **full parity** with Vercel Production before a release: recommend `npm run env:pull:production` after `vercel link` (see root `README.md`). Do **not** set `YANGO_TOKEN_REGISTRY_PRECEDENCE=env` unless they explicitly want env to override the KV token registry (default omits it = **registry wins**, same as prod merge order). Supabase URL/keys are trimmed in `lib/supabase.ts`.
