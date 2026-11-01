---
name: nexora-docker-postgres
description: Configure Nexora Docker Compose, local PostgreSQL/Prisma ORM, and external Supabase Storage.
---

# Nexora Docker and local PostgreSQL

Read [AGENTS.md](../../../AGENTS.md) and the run instructions in
[Architecture](../../../docs/Folder-ARCHITECTURE.md). Run Compose from repository root.

## Inspect

Inspect Compose, backend/frontend Dockerfiles and .dockerignore, env examples,
backend database/config.ts and Prisma schema. Use docker compose config --quiet;
never print interpolated secrets or connection URLs.

## Preserve the environment

- Compose runs frontend/backend on 5173/3000 and PostgreSQL locally on 5432 with
  a named volume. Supabase Storage remains external. Do not add healthchecks or
  /health endpoints unless requested.
- Vite proxies /api to backend:3000 in Compose, localhost:3000 on the host.
  depends_on is startup ordering only; it does not prove API/DB readiness.
- Each app has its own package/lockfile/Dockerfile. Run npm from that app folder.
  Backend runtime runs built JS as node; rebuild after source/config changes.
- Backend connects through DATABASE_URL to local PostgreSQL without SSL. Root
  `.env` is for Compose (`postgres` hostname); `backend/.env` is for npm on host
  (`localhost`). Preserve active Auth secrets and never print credentials.
- Auth remains Nexora accounts/sessions/JWT, not Supabase Auth. Application code
  accesses its own schema through Prisma repositories/pg; do not edit provider auth/storage tables.
- Prisma ORM and `schema.prisma` remain in use. The project has no Prisma Migrate
  workflow or migration files. `npm run db:push` synchronizes only the local
  development database when its schema changes; run it manually, never on
  startup, Supabase, or a database containing needed data. Generate Prisma Client after schema changes; generated
  code is ignored and compiled into dist for the runtime image.
- Catalog uploads images/video to Supabase Storage through Admin-authorized backend
  APIs. Public bucket reads are separate from Admin writes. SUPABASE_SECRET_KEY is server
  only; bucket/path objects are immutable, uploads use upsert:false. No secret in VITE_*.
- Database backups do not include object bytes; verify Storage backup/restore
  separately. Do not delete user data or snapshots as a configuration change.

## Validate and report

Validate Compose with `docker compose config --quiet`. Run backend typecheck/lint
for DB configuration changes. Do not run tests unless requested. Schema validation
and `db:push` do not verify Supabase Storage integration.
Report missing project configuration and unverified live behavior precisely. Keep
run instructions in Architecture; do not create README files without a user request.
