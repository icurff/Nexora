---
name: nexora-backend
description: Implement or debug Nexora NestJS APIs and business logic in the gateway and five backend service folders. Use for backend features, service contracts and regression fixes; future FastAPI recommendation work needs its own workflow.
---

# Nexora Backend Development

Read [AGENTS.md](../../../AGENTS.md) and the [development rules](../../../AGENTS.md#development-rules).
Code paths below are relative to the repository root; Markdown links are relative
to this file.

## Establish the scope

1. Inspect the affected service folder's package, modules, controllers, providers, and
   tests. Backends are currently scaffolds; do not assume an ORM, guards, DTO
   validation, HTTP client, or messaging infrastructure already exists.
2. Find relevant requirements and acceptance cases in `docs/SRS.md`. Read
   `docs/Folder-ARCHITECTURE.md` to establish data ownership.
3. Identify inputs, outputs, errors, permissions, side effects, and dependencies.
   Distinguish working APIs from planned contracts.

## Implement

- Create feature modules as needed. Controllers handle requests; providers carry
  business logic. Keep structure proportional to the current feature.
- Follow ESM/NodeNext and relative `.js` imports. Register modules/providers and
  verify bootstrap behavior as well as isolated classes.
- Connect validation to the actual request pipeline. TypeScript DTO types alone
  do not validate runtime input.
- Check the actor, account state, and ownership for private data. Include a test
  attempting access to another user's data when authorization is affected.
- For persistence, read the relevant Database design fields/constraints alongside
  current Architecture ownership. Use the Docker/PostgreSQL skill for migrations
  or configuration changes; never access another service's database directly.
- For inventory, checkout, and payment changes, read transition and retry rules.
  Test relevant duplicate operations, stale state, and races. Do not introduce
  Kafka/Redis dependencies for unrelated tasks.
- When routes or prefixes change, check Gateway, Vite proxy, consumers, and the
  Compose `/health` contract. An environment URL does not implement an HTTP integration.

## Validate and hand off

Run relevant checks from the affected service folder: typecheck, lint, tests, and
build. Expand validation when shared contracts change. Use existing Vitest and
`@nestjs/testing` conventions. E2E configuration is absent; claim e2e validation
only after a real suite is present and has run.

Add a regression test for behavioral bugs or meaningful success/error tests for
new features. State whether DB/provider tests use mocks or real integration.
Update configuration instructions and API documentation when contracts change.
