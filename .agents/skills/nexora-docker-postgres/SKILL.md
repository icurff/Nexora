---
name: nexora-docker-postgres
description: Configure or troubleshoot Nexora Docker Compose, Nest container startup and PostgreSQL ownership, initialization or migrations. Use for local infrastructure and database changes; do not provision deferred Kafka, Redis or Elasticsearch as a side effect.
---

# Nexora Docker and PostgreSQL

Read [AGENTS.md](../../../AGENTS.md), the [development rules](../../../AGENTS.md#development-rules), and
the [operations README](../../../README.md). Run Docker Compose commands from the repository root.

## Gather evidence

1. Inspect relevant parts of `docker-compose.yml`, the affected service folder's `Dockerfile` and `.dockerignore`,
   `.env.example`, and `docker/postgres/init-databases.sh`.
2. Use `docker compose config --quiet`, `docker compose ps`, and affected service
   logs. Avoid printing configuration with interpolated passwords.
3. Separate build, mount/watch, HTTP startup, network, and PostgreSQL authentication
   failures. HTTP `/health` success does not prove database integration.

## Preserve operational behavior

- `docker compose up` starts the full stack. Select only the services needed for
  a task to limit resource use; `docker compose up -d --build auth-service`
  also starts PostgreSQL.
- Containers connect to `postgres:5432`; host processes use `localhost` and the
  fixed PostgreSQL port `5432`. Compose publishes the Gateway on `3000`, each
  backend on `3001`–`3005` (container port `3000`), and the frontend on `5173`.
  Host application scripts do not yet load `.env` automatically; each Nest app has a
  distinct default port in `src/main.ts`.
- Compose publishes each backend's container port 3000 on its own loopback host
  port so it can be tested directly; service-to-service calls still use the
  Compose service name and port 3000.
- Each application has its own Dockerfile, build context, and lockfile. Its image installs dependencies from that folder's lockfile.
  Do not mount Windows `node_modules` into containers. Backend source is mounted;
  dependency/backend configuration changes require rebuilding that service image.
- Nest watch uses `--no-shell` to restart child processes in the slim image. When
  changing commands, signals, or shutdown behavior, verify reload and shutdown,
  not just initial startup. Runtime executes built JavaScript without watch mode.
- Preserve loopback port bindings and the application runtime's `node` user unless
  the task has a specific, explained reason to change them.

## PostgreSQL and migrations

- Auth, Catalog, Order, Payment, and Notification each have a separate DB/user.
  Applications use their own credentials; initialization revokes PUBLIC CONNECT/TEMP.
- Initialization runs only on an empty volume. Existing databases need explicit
  role changes or migrations. Editing `.env` does not change stored role passwords.
- No ORM/migration runner exists yet. For the first schema task, select a tool
  appropriate to the workspace, create versioned migrations, and document execution.
  Do not use the initialization script as a migration history for existing databases.
- Adapt baseline fields according to Architecture ownership. Avoid cross-service
  foreign keys/joins. Test constraints, IDs/money, and upgrades on an isolated DB.
- Do not delete volumes to force initialization unless deletion was requested.
  Inspect actual state before attributing a failure to existing data.

## Validate changes

- Documentation/configuration: validate syntax and the environment contract.
- Dockerfile/startup: build and run affected services when Docker is available;
  check logs, health, reload for watch changes, and shutdown for signal changes.
- Schema/permissions: connect as the application user in a test environment;
  verify own-database access succeeds and cross-database access is denied.
- Initialization: use a separate test project/volume. Record resource names and
  clean up only resources created for that test. Keep secrets out of reports.

Report which containers were started or left running, successful checks, and
remaining limits. Update README when startup, environment, or initialization changes.
