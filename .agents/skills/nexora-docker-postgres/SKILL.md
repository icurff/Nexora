---
name: nexora-docker-postgres
description: Configure Nexora frontend/backend Docker Compose, external Supabase PostgreSQL/Storage and versioned migrations.
---

# Nexora Docker and Supabase PostgreSQL

Read [AGENTS.md](../../../AGENTS.md) and the run instructions in
[Architecture](../../../docs/Folder-ARCHITECTURE.md). Run Compose from repository root.

## Inspect

Inspect Compose, backend/frontend Dockerfiles and .dockerignore, env examples,
backend database/config.ts and versioned migrations. Use docker compose config
--quiet and relevant logs; never print interpolated secrets or connection URLs.

## Preserve the environment

- Compose runs only frontend/backend on 5173/3000. Database and image objects use
  hosted Supabase. Do not provision local PostgreSQL/Supabase containers, database
  volumes, healthchecks or /health endpoints without a new user request.
- Vite proxies /api to backend:3000 in Compose, localhost:3000 on the host.
  depends_on is startup ordering only; it does not prove API/DB readiness.
- Each app has its own package/lockfile/Dockerfile. Run npm from that app folder.
  Backend runtime runs built JS as node; rebuild after source/config changes.
- Backend connects through DATABASE_URL with certificate-verified TLS. Prefer a
  direct connection; use the session pooler when IPv4 is required. Copy endpoint
  settings from Dashboard, do not invent hostnames. Use DATABASE_SSL_CA for PEM
  when required. URL SSL parameters are rejected to prevent overriding verification.
- Root .env is for Compose; backend/.env is for npm host. Preserve active Auth
  secrets, and remove unused settings when cleanup is requested. Missing Supabase
  credentials stay blank with instructions; never invent a project URL or key.
- Auth remains Nexora accounts/sessions/JWT, not Supabase Auth. Application code
  accesses its own schema through Prisma repositories/pg; do not edit provider auth/storage tables.
- Prisma Migrate uses explicit versioned migrations in backend/prisma/migrations.
  Preserve auth_schema_migrations as legacy history. Existing Auth databases need
  an explicit migration:baseline before migration:run; baseline checks schema drift
  before recording 0_auth in _prisma_migrations. Never reset or automatically reseed.
- Prisma CLI loads strict TLS options and a temporary CA file from DATABASE_SSL_CA
  through prisma.config.ts; npm scripts call the standard CLI without a custom runner. Do not use db push or migrate reset on
  a working database. Generate Prisma Client after schema changes; generated code
  is ignored and compiled into dist for the runtime image.
- Confirm the target before any real project migration or seed. Test schema/roles
  and data transfer on isolated project/database inputs, never by resetting live data.
- Supabase Storage upload is planned Catalog work. Public catalog bucket reads are
  separate from Admin writes authorized by backend. SUPABASE_SECRET_KEY is server
  only; bucket/path objects are immutable, uploads use upsert:false. No secret in VITE_*.
- Database backups do not include object bytes; verify Storage backup/restore
  separately. Do not delete user data or snapshots as a configuration change.

## Validate and report

Validate Compose has exactly the two app services and no healthcheck/readiness
condition. Run backend typecheck/lint/tests/build for DB configuration changes.
Mocked configuration/HTTP tests do not prove Supabase TLS/migration/upload integration.
Only run external DB/provider checks with configured target and authorized data scope.
Report missing project configuration and unverified live behavior precisely. Keep
run instructions in Architecture; do not create README files without a user request.
