# AI Agent Guide - Nexora

Read this file when starting work in this repository. Development rules are
included below so Codex discovers them with the project instructions. Project
Codex settings and agent roles are in `.codex/config.toml` and `.codex/agents/`.

## Scope and working agreements

- Follow the user's current request. Task lists are references, not a mandatory
  implementation order or permission to expand the scope.
- Prefer simple, readable solutions that are easy to maintain. Add complexity
  only when a current requirement needs it.
- Prefer a suitable maintained library when it reduces custom code and makes
  the implementation easier to understand and maintain.
- Inspect code and configuration before claiming a feature exists. Distinguish
  **implemented behavior**, **planned design**, and **proposals**.
- Before changing repository files, present a concise plan and a small set of
  meaningful implementation directions or options
- implement the agreed scope and validate the result. Ask for
  clarification when a missing decision materially affects business behavior,
  data, or scope.
- Do not call the reviewer agent unless the user explicitly asks to involve a
  reviewer agent. The assistant may still inspect its own changes and run the
  checks required for the task.
- In this project, "docs" means Markdown `.md` by default. Work on Word/PDF files
  only when the user explicitly identifies that format or file.
- Do not create README files unless the user explicitly requests them.
- Inspect Git status and diffs before editing. Preserve unrelated existing work.
  Do not stage, commit, or push unless requested.

## Current implementation

Last reviewed: 2026-11-01. Verify and update this table as the code evolves.

| Component      | Status                                                                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend`     | React/Vite/TypeScript; Auth, Admin Category/Product/SKU/inventory, public product listing/detail and Customer cart use backend APIs; checkout/orders remain unavailable/demo; `/admin` requires an authenticated Admin and checks backend authorization |
| `backend`      | One NestJS modular monolith; AuthModule, CatalogModule public/admin Product/SKU/inventory APIs and OrderModule account-cart APIs; Supabase Storage upload adapter and Gmail SMTP reset email; cart concurrency and browser end-to-end remain unverified |
| Database       | Prisma ORM/schema with PostgreSQL 17 in local Docker Compose; sync local schema explicitly with `npm run db:push`; no Prisma Migrate workflow |
| Docker         | Compose runs frontend/backend/PostgreSQL with a named local database volume; Supabase Storage remains external; no healthcheck                   |
| Other modules  | OrderModule currently supports account carts only; order placement, Payment, Tracking and rule-based Recommendation remain planned; browser upload remains server-authorized; Notification sends password reset email directly without email jobs/workers |
| AI model       | Python/FastAPI integration is deferred; no application/container/database exists                                                            |
| Infrastructure | No Gateway, Saga, Kafka, Redis or Elasticsearch dependency in the current architecture                                                      |
| CI             | GitHub Actions verifies and Docker-builds backend/frontend on pushes and pull requests to main                                              |

Image uploads, metadata and Supabase Storage integration belong to the Catalog module
inside backend. Do not introduce an image application or independent business
services. Uploads use the configured public-read bucket; credentials stay server-only.
A future Python model integration requires explicit scope; do not add a NestJS
recommendation application.

Product specifications belong in the product description; do not add a separate
Product Attributes field. Each Product defines its own SKU option codes and labels,
such as color and size; Category only classifies Products. SKU options distinguish
prices and stock. The Product plan has only ACTIVE and INACTIVE. Admin creation
must atomically persist a complete ACTIVE Product with valid content and links to
image assets whose upload succeeded. SKU(s) are optional at creation; a Product
without SKUs uses its Product-level price and inventory and remains purchasable.
Products with SKUs use each SKU's price and inventory.
Admin can enter initial stock while creating a no-SKU Product or for each new
SKU; omitted initial stock defaults to zero.
Admin manages stock through Catalog's per-SKU inventory page/API. Every color/size
combination has its own inventory row. Do not add an image READY state, a DRAFT
state, or a save-draft workflow.

## Documentation map

| Question                                                        | Source                                                                                                               |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| How does the project run today?                                 | Each app folder's `package.json`, `docker-compose.yml`, actual code, and [Architecture](docs/Folder-ARCHITECTURE.md) |
| How do backend modules share responsibilities and transactions? | [Architecture](docs/Folder-ARCHITECTURE.md)                                                                          |
| What are the user flows, planned APIs, and acceptance criteria? | [SRS](docs/SRS.md), relevant FR/UC/TC entries                                                                        |
| What are the business rules and scope?                          | [BRD](docs/BRD.md)                                                                                                   |
| What are the data types, fields, and constraints?               | [Database design](docs/DATABASE_DESIGN.md)                                                                           |
| What are the GNN/RetailRocket research boundaries?              | [Research scope](docs/REQUIREMENTS_AND_RESEARCH_SCOPE.md)                                                            |
| Where are implementation tasks and their current status?        | [Implementation plan](docs/IMPLEMENTATION_TASKS.md)                                                                  |

The implementation plan is [IMPLEMENTATION_TASKS.md](docs/IMPLEMENTATION_TASKS.md).
Its task numbers are references, not an execution order or proof of acceptance.
Keep code existence, partial work, deferred scope and verified integration separate.
`docs/task` is optional local working material and is not the canonical task list.

`DATABASE_DESIGN.md` describes the shared PostgreSQL database target. Foreign
keys, joins and transactions across backend modules are allowed in this database;
module ownership guides code organization. `backend/prisma/schema.prisma` is the
schema source of truth; use Prisma ORM and synchronize only a local development
database with `npm run db:push`. Do not add or run Prisma Migrate workflows.
Keep order snapshots immutable even when foreign keys exist.

## Repository skills

Read only the skills relevant to the task:

| Task                                                    | Skill                                                                    |
| ------------------------------------------------------- | ------------------------------------------------------------------------ |
| NestJS APIs, business logic, and backend fixes          | [nexora-backend](.agents/skills/nexora-backend/SKILL.md)                 |
| React screens and API integration                       | [nexora-frontend](.agents/skills/nexora-frontend/SKILL.md)               |
| Docker, PostgreSQL, and configuration                   | [nexora-docker-postgres](.agents/skills/nexora-docker-postgres/SKILL.md) |

Skills guide task execution; they do not authorize additional actions. Agents
without automatic skill discovery can read the linked `SKILL.md` files directly.

## Development rules

These rules govern new work; mentioning a mechanism does not mean it is already
implemented.

## 1. Architecture boundaries

- Keep exactly two application folders: frontend and backend. Backend is one
  NestJS process organized into feature modules, using one PostgreSQL database.
- Auth owns accounts, sessions and addresses; Catalog owns products, SKUs, images
  and inventory; Order owns carts/orders; Payment owns payment integration and
  payment rules; Notification owns email delivery jobs. These are module boundaries,
  not independently deployed services or databases.
- Modules communicate through providers in the same process. Keep controllers thin
  and avoid circular imports. Share the Prisma.TransactionClient when one use case
  changes data across modules; do not make HTTP calls between backend modules.
- Checkout and lifecycle use one transaction for orders, stock, carts, history,
  business events and idempotency. Preserve row locking, stable lock ordering and
  recovery after retries/restarts. Network provider calls happen outside DB locks.
- Persist email jobs with business changes, then send after commit with retry.
  Do not add Saga, Kafka/outbox/inbox messaging between modules. An email_outbox
  table is a local job queue and does not imply a broker.
- Do not add Redis, Elasticsearch or a Python model application unless the user's
  requested scope calls for it. Never report mocked provider/DB success as integration.

## 2. Code and dependencies

- Each application is independent and has its own `package.json` and
  `package-lock.json`. Run npm commands from that application folder. Use Node 24
  and npm 11 as recorded in `.nvmrc` and each package's `engines`.
- Install a dependency only in the application that needs it, for example, from
  `backend`: `npm install <package>`. Avoid package-manager changes or broad
  upgrades within small tasks. Do not import frontend source into backend or backend source into frontend.
- Backend code uses strict TypeScript and ESM/NodeNext. Preserve `.js` extensions
  on relative imports. Frontend code follows its own Vite configuration.
- Keep controllers thin, business logic in providers/services, and persistence
  behind feature repositories. Backend uses Prisma ORM/PostgreSQL. The Prisma
  schema is the source of truth; `db:push` is for the local development DB only.
- Create modules and abstractions for current features. Do not generate empty
  files from the illustrative Architecture directory tree.
- Use ESLint in every Node application and Prettier for formatting. Each app has
  its own config and development dependencies. Format only relevant files; avoid
  formatting every app during small tasks.

## 3. Contracts and business data

- Business APIs use `/api/v1`; check SRS and actual routes when
  implementing them. Do not add /health endpoints, Docker healthchecks or
  readiness dependencies unless the user requests them.
- Serialize PostgreSQL `bigint` IDs as decimal strings in JSON. Avoid arbitrary
  `Number(id)` conversions; identifiers are not an authorization mechanism.
- Money is integer VND. Use exact arithmetic and validate bounds before writes.
  Reject fractional money at the API boundary instead of relying on SQL rounding.
- Store timestamps as `timestamptz`, expose ISO 8601 UTC, and display Vietnamese
  time using `Asia/Ho_Chi_Minh`. Preserve leading zeros in location/source codes.
- Validate inputs and ownership on the backend. Do not trust browser-supplied
  actor IDs, roles, prices, stock, or payment state. Keep business authorization
  and ownership checks in the owning module, using AuthModule guards for protected routes.
- Inventory/checkout changes must preserve `available = on_hand - reserved`,
  nonnegative stock, no reservation on cart addition, and no duplicate effects
  on retries. Read the SRS transition table before changing order lifecycle logic.
- Orders retain purchase-time snapshots of prices, SKUs, images, and addresses.
  Later Catalog/Auth changes must not rewrite them. Repeated requests with the
  same key and payload return the previous result; a changed payload using that
  key is rejected according to the contract.
- Payment verifies payOS webhooks and handles duplicates. A successful browser
  redirect is not proof of payment. Read the COD/payOS rules before changing this flow.

## 4. Local environment, data, and configuration

- Docker Compose runs frontend/backend on ports 5173/3000 and local PostgreSQL
  on 5432 with a named volume. Supabase Storage remains external. `depends_on`
  orders startup and does not prove database readiness.
- Preserve active `.env` values and Auth secrets; remove obsolete settings when
  the user requests cleanup. Add nonsecret examples to `.env.example` and
  document how the application loads configuration.
- Keep secrets out of logs and reports. Use `docker compose config --quiet` for
  validation; full interpolated configuration can expose passwords.
- Configure DATABASE_URL for local PostgreSQL without SSL. Root `.env` serves
  Compose (`postgres` hostname); `backend/.env` serves npm on the host (`localhost`).
- Never point `db:push` at Supabase or another remote/working database. The
  project does not use Prisma Migrate; migration SQL and baseline files are removed.
- Supabase Storage does not imply Supabase Auth. Nexora keeps its existing
  account/session/JWT logic. Do not alter provider auth/storage tables.
- Catalog images use public Storage reads with backend-authorized Admin writes.
  SUPABASE_SECRET_KEY stays server-only; public read must not imply public write.
  Use immutable object paths and upsert:false to preserve order snapshots.
  Catalog upload API/adapter is implemented; the Supabase URL, secret and public
  bucket still require deployment configuration and live verification.
- Do not use `down -v`, volume pruning, or database drop/truncate as troubleshooting
  shortcuts unless deletion of that data was requested. `db:push` is only for a
  local development database; do not point it at a database with needed data.
- Do not modify research artifacts/datasets or reseed data just to make tests pass.
  `docs/data` and `docs/task` are ignored and may be absent in another clone.
  Report specific missing inputs when needed; do not invent their contents.

## 5. Validation and reporting

- Select checks using the scripts in the affected application's `package.json`.
  A declared script may lack its required config or tests: the backend e2e script
  currently has no `vitest.config.e2e.ts`, and frontend has no test script.
- Test observable behavior and relevant errors, races, and retries. Mock tests do
  not demonstrate real database or provider integration.
- For Markdown-only changes, check content, links, formatting, and diffs. Do not
  start the stack or add tests solely to assert wording.
- Distinguish passed checks, failed checks, and checks not run. Explain environment
  blockers and their practical limits instead of calling blocked checks successful.
- Finish with the outcome, key files, validation evidence, and relevant remaining
  gaps. Update documentation when behavior, ownership, or run instructions change.
- Write agent guides, rules, skills, metadata, and usage examples in English.
  User-facing conversation and product UI remain Vietnamese unless requested otherwise.
