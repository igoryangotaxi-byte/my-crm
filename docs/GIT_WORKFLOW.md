# Git workflow

## Branch strategy

- `main`: production-ready branch, auto-deployed by Vercel to production.
- `develop`: integration branch for ongoing work.
- `feature/*`: task-specific branches created from `develop`.

## Standard flow

1. Create feature branch from `develop`.
2. Implement changes and open PR into `develop`.
3. Ensure CI (`lint` + `build`) passes.
4. Merge into `develop` and validate Vercel preview.
5. Open PR from `develop` into `main` for production release.
6. Merge into `main` to trigger production deployment.

## Hotfix flow

- For urgent fixes, create `hotfix/*` from `main`.
- Merge to `main` first, then back-merge into `develop`.

## Environment variables

- Keep secrets in Vercel project settings.
- Never commit real API tokens to git.
