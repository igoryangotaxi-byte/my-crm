# Sales Operations presentations

## Yango Sales Operations Onboarding

- **File:** [Yango-Sales-Operations-Onboarding.pptx](./Yango-Sales-Operations-Onboarding.pptx)
- **Audience:** Yango owner / leadership (English)
- **Contents:** Full Sales Operations module — purpose, roles, every section, dependencies, integrations, operating checklist
- **Brand:** Yango red accent (`#FF2D2D`), provided logo, live UI screenshots (privacy-softened)

### Regenerate

```bash
# 1) Capture read-only localhost screenshots (dev server must be running)
node scripts/presentations/capture-so-screenshots.mjs

# 2) Build the PPTX
node scripts/presentations/generate-sales-operation-onboarding-pptx.mjs
```

Optional env for capture:

- `SO_CAPTURE_BASE` (default `http://localhost:3000`)
- `SO_CAPTURE_USER_ID` (default `user-admin-1`)

Capture is GET-only (no pipeline mutations). Requires `.env.local` so the session cookie matches the running Next.js process.
