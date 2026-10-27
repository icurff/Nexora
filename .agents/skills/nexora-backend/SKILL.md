---
name: nexora-backend
description: Implement or debug Nexora NestJS APIs and business logic in the backend modular monolith.
---

# Nexora Backend Development

Read [AGENTS.md](../../../AGENTS.md), [Architecture](../../../docs/Folder-ARCHITECTURE.md)
and the relevant FR/UC/TC entries in [SRS](../../../docs/SRS.md).
Paths below are relative to the repository root.

## Inspect and implement

- Inspect backend/package.json, modules, controllers, providers, DTOs and tests.
  AuthModule, guards, TypeORM and migrations exist; other business modules are planned.
- Keep one NestJS application and one PostgreSQL database. Add feature modules
  when implementing real behavior; avoid empty scaffolds or independent services.
- Preserve ESM/NodeNext and relative .js imports. Register modules/providers and
  verify actual HTTP/bootstrap behavior, not only isolated classes.
- Controllers handle HTTP/DTOs; providers own business rules; adapters handle DB
  and external providers. Import AuthModule to use AuthService/AuthGuard/RolesGuard.
- Validate runtime inputs, role and ownership; never trust client actor/role headers.
- Share the transaction EntityManager for writes across modules. Checkout and
  lifecycle commit orders/stock/cart/history/event/idempotency together. Use stable
  lock ordering, exact money arithmetic and string bigint IDs.
- Call payOS/Supabase Storage/email outside transactions holding row locks. Queue email
  jobs with business changes, send after commit and retry safely.
- Read SRS transitions and duplicate/retry rules before changing inventory/payment.
  Browser payment redirects do not authorize PAID. No Saga or module-to-module HTTP.
- Keep /api/v1 contracts and the Vite proxy aligned. No /health endpoint or Docker
  healthcheck is required. PostgreSQL lives on Supabase, with verified SSL via
  DATABASE_URL; Storage is planned Catalog integration, not existing upload code.

## Validate

From backend run typecheck, lint, test and build. HTTP tests may override adapters;
state explicitly when DB/provider behavior is mocked. Add meaningful regression
coverage when behavior changes. test:e2e currently lacks its configuration; do not
claim that suite ran. Update affected API/configuration docs and preserve user edits.
