# Appli OpenClaw runtime

Private always-on agent engine. Appli (Vercel) owns auth, RBAC, Tool Gateway, UI and OAuth tokens.
OpenClaw never receives Supabase keys or user refresh tokens.

## Run locally

```bash
export OPENCLAW_GATEWAY_TOKEN=dev-token
export APPLI_TOOL_GATEWAY_URL=http://host.docker.internal:3000
export AI_TOOL_GATEWAY_SECRET=same-as-applitaxi
docker compose -f infra/openclaw/docker-compose.yml up
```

Appli env:

```
OPENCLAW_GATEWAY_URL=http://127.0.0.1:18789
OPENCLAW_GATEWAY_TOKEN=dev-token
AI_TOOL_GATEWAY_SECRET=same-as-applitaxi
```

If OpenClaw is down, Appli uses the in-process OpenAI tool loop against the same Tool Gateway.

Host tools (`exec`, `write`, `browser`, …) are denied in `openclaw.json`.
