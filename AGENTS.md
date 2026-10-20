# AI Agent Guide - Nexora

Read this file when starting work in this repository. Development rules are
included below so Codex discovers them with the project instructions. Project
Codex settings and agent roles are in `.codex/config.toml` and `.codex/agents/`.

## Scope and working agreements

- Use GPT-6 Astra with High reasoning for planning and discussion; use GPT-6 Luna
  with High reasoning for implementation and review. Follow the
  [model routing rules](#6-model-selection-by-activity).
- Follow the user's current request. Task lists are references, not a mandatory
  implementation order or permission to expand the scope.
- Inspect code and configuration before claiming a feature exists. Distinguish
  **implemented behavior**, **planned design**, and **proposals**.
- Complete clear implementation requests and validate the result. Ask only when
  a missing decision materially affects business behavior, data, or scope.
- In this project, "docs" means Markdown `.md` by default. Work on Word/PDF files
  only when the user explicitly identifies that format or file.
- Inspect Git status and diffs before editing. Preserve unrelated existing work.
  Do not stage, commit, or push unless requested.

## Current implementation

Last reviewed: 2026-10-20. Verify and update this table as the code evolves.

| Component                                                                                     | Status                                                                                                   |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `frontend`                                                                                    | React/Vite/TypeScript scaffold                                                                           |
| `api-gateway`                                                                                 | NestJS scaffold with `/health`; business routes are not implemented                                      |
| `auth-service`, `catalog-service`, `order-service`, `payment-service`, `notification-service` | Five NestJS backend scaffolds with `/health`                                                             |
| Docker/PostgreSQL                                                                             | Compose, one Dockerfile per application, and PostgreSQL with five separate application databases/users |
| Application persistence                                                                       | Compose provides `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD`; adapters, ORM, migrations, and seeds are not implemented |
| Recommendation                                                                                | Planned as Python/FastAPI; no code, container, or database yet                                           |
| Kafka, Redis, Elasticsearch                                                                   | Planned infrastructure; not provisioned in the current stack                                             |

Image uploads, metadata, and Cloudinary integration belong to Catalog. Do not
introduce a separate image service. Future Recommendation will be a separate Python/FastAPI application; do not create a NestJS scaffold for it.

## Documentation map

| Question                                                        | Source                                                               |
| --------------------------------------------------------------- | -------------------------------------------------------------------- |
| How does the project run today?                                 | [README](README.md), each app folder's `package.json`, `docker-compose.yml`, and actual code |
| Who owns data and coordinates services?                         | [Architecture](docs/Folder-ARCHITECTURE.md)                          |
| What are the user flows, planned APIs, and acceptance criteria? | [SRS](docs/SRS.md), relevant FR/UC/TC entries                        |
| What are the business rules and scope?                          | [BRD](docs/BRD.md)                                                   |
| What are the data types, fields, and constraints?               | [Database design](docs/DATABASE_DESIGN.md)                           |
| What are the GNN/RetailRocket research boundaries?              | [Research scope](docs/REQUIREMENTS_AND_RESEARCH_SCOPE.md)            |

`DATABASE_DESIGN.md` includes an earlier single-database baseline. Its cross-domain
foreign keys, joins, and transactions are superseded by service ownership and
local transactions in Architecture. Do not translate that baseline directly into
a microservices schema. If requirements still conflict, identify the conflict
before deciding the affected behavior and continue independent work.

## Repository skills

Read only the skills relevant to the task:

| Task                                                    | Skill                                                                    |
| ------------------------------------------------------- | ------------------------------------------------------------------------ |
| NestJS APIs, business logic, and backend fixes          | [nexora-backend](.agents/skills/nexora-backend/SKILL.md)                 |
| React screens and API integration                       | [nexora-frontend](.agents/skills/nexora-frontend/SKILL.md)               |
| Docker, PostgreSQL, configuration, and migrations       | [nexora-docker-postgres](.agents/skills/nexora-docker-postgres/SKILL.md) |
| Markdown documentation and architecture synchronization | [nexora-docs](.agents/skills/nexora-docs/SKILL.md)                       |

Skills guide task execution; they do not authorize additional actions. Agents
without automatic skill discovery can read the linked `SKILL.md` files directly.

## Development rules

These rules govern new work; mentioning a mechanism does not mean it is already
implemented.

## 1. Architecture boundaries

- Gateway handles API entry and forwarding. Business logic and persistence belong
  to their owning services; keep checkout, inventory, and payment logic out of it.
- Auth owns accounts, sessions, and addresses. Catalog owns products, SKUs, images,
  and inventory. Order owns carts, orders, and Saga orchestration. Payment owns
  authoritative payment state. Notification owns notification delivery jobs.
- Each service accesses only its own database. Do not import another service's
  internal source, join or reference tables across databases, or use the PostgreSQL
  administrator account in application code. Integrate through contracts and
  distinguish snapshots from projections.
- Cross-service workflows follow the Order Saga design with local transactions,
  idempotency, and recovery. Kafka/outbox/inbox are currently planned. If a task
  depends on missing infrastructure, explain the dependency and a solution within
  scope; do not report mocked success as completed integration.
- Add Kafka, Redis, Elasticsearch, or FastAPI when the requested work calls for
  that component, not merely because a design document mentions it.

## 2. Code and dependencies

- Each application is independent and has its own `package.json` and
  `package-lock.json`. Run npm commands from that application folder. Use Node 24
  and npm 11 as recorded in `.nvmrc` and each package's `engines`.
- Install a dependency only in the application that needs it, for example, from
  `auth-service`: `npm install <package>`. Avoid package-manager changes or broad
  upgrades within small tasks. Do not import source files from another service.
- Backend code uses strict TypeScript and ESM/NodeNext. Preserve `.js` extensions
  on relative imports. Frontend code follows its own Vite configuration.
- Keep controllers thin, business logic in providers/services, and persistence
  behind the appropriate adapter boundary. No ORM has been selected yet: choose
  and explain one when a task needs it, rather than treating an absent ORM as an
  established convention.
- Create modules and abstractions for current features. Do not generate empty
  files from the illustrative Architecture directory tree.
- Use ESLint in every Node application and Prettier for formatting. Each app has
  its own config and development dependencies. Format only relevant files; avoid
  formatting every app during small tasks.

## 3. Contracts and business data

- Business APIs are planned under `/api/v1`; check SRS and actual routes when
  implementing them. Keep `/health` aligned with Docker healthchecks. It currently
  proves HTTP liveness, not database connectivity.
- Serialize PostgreSQL `bigint` IDs as decimal strings in JSON. Avoid arbitrary
  `Number(id)` conversions; identifiers are not an authorization mechanism.
- Money is integer VND. Use exact arithmetic and validate bounds before writes.
  Reject fractional money at the API boundary instead of relying on SQL rounding.
- Store timestamps as `timestamptz`, expose ISO 8601 UTC, and display Vietnamese
  time using `Asia/Ho_Chi_Minh`. Preserve leading zeros in location/source codes.
- Validate inputs and ownership on the backend. Do not trust browser-supplied
  actor IDs, roles, prices, stock, or payment state. Keep business authorization
  and ownership checks in the destination service even with gateway authentication.
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

- `docker compose up` starts the full stack. To limit resource use, start only the services needed for the task, such as `docker compose up -d postgres`.
- Preserve existing `.env` values. Add nonsecret examples to `.env.example` and
  document how the application loads configuration.
- Keep secrets out of logs and reports. Use `docker compose config --quiet` for
  validation; full interpolated configuration can expose passwords.
- PostgreSQL initialization scripts run only on an empty volume. Editing them
  does not update an existing database schema or role password.
- Do not use `down -v`, volume pruning, or database drop/truncate as troubleshooting
  shortcuts unless deletion of that data was requested. Prefer migrations and
  isolated test databases; do not run destructive tests on working databases.
- Do not modify research artifacts/datasets or reseed data just to make tests pass.
  `docs/data` and `docs/task` are ignored and may be absent in another clone.
  Report specific missing inputs when needed; do not invent their contents.

## 5. Validation and reporting

- Select checks using the scripts in the affected application's `package.json`.
  A declared script may lack its required config or tests: backend e2e scripts
  currently have no `vitest.config.e2e.ts`, and frontend has no test script.
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

## 6. Model selection by activity

| Activity                                                                                             | Model                       | Reasoning effort |
| ---------------------------------------------------------------------------------------------------- | --------------------------- | ---------------- |
| Planning, requirements discussion, architecture discussion, and trade-off analysis                   | GPT-6 Astra (`gpt-6-astra`) | High (`high`)    |
| Implementation, bug fixes, tests, documentation/configuration edits, and execution of an agreed plan | GPT-6 Luna (`gpt-6-luna`)   | High (`high`)    |
| Code review, regression review, and validation of changes                                            | GPT-6 Luna (`gpt-6-luna`)   | High (`high`)    |

- Select the model for the activity being performed, not merely the interface's
  Plan/Default mode. A task containing multiple phases follows the corresponding
  model at each phase.
- At a handoff, preserve the user's request, accepted decisions, constraints,
  affected files, and validation expectations. Return to Astra High if a review
  uncovers a design decision requiring discussion; use Luna High for the resulting
  implementation and review.
- The project config sets the primary model to Astra High. Custom roles in
  `.codex/agents/` set `planner` to Astra High and `implementer`/`reviewer` to
  Luna High. For implementation and review, delegate to the corresponding role
  when delegation is available and permitted; a review request does not authorize
  the reviewer to edit files.
- Apply this routing through model-selection or delegation controls when those
  controls are available and permitted. A Markdown rule does not itself change
  the active session model. If the required control or model is unavailable,
  disclose the limitation instead of claiming a switch or silently substituting
  another model.
- An explicit model instruction from the user for the current task overrides
  this default routing.
