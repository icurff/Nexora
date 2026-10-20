# Working with AI Agents in Nexora

## Configuration and instruction discovery

| Path                                               | Purpose                                                                              |
| -------------------------------------------------- | ------------------------------------------------------------------------------------ |
| [AGENTS.md](../AGENTS.md)                          | Automatically discovered project instructions and development rules                  |
| [config.toml](config.toml)                         | Project model and subagent defaults; loaded for trusted projects                     |
| [agents/planner.toml](agents/planner.toml)         | Planning and discussion role using Astra High                                        |
| [agents/implementer.toml](agents/implementer.toml) | Implementation role using Luna High                                                  |
| [agents/reviewer.toml](agents/reviewer.toml)       | Review role using Luna High; no file edits                                           |
| [.agents/skills](../.agents/skills)                | Discoverable task skills with `SKILL.md` and UI metadata                             |
| This README                                        | Setup and validation reference linked from `AGENTS.md`; not executable configuration |

Project configuration supplements `~/.codex/config.toml`; project values apply
only when the project is trusted. Restart or begin a new session to load newly
added configuration and roles. Session/model-picker overrides may take precedence.
Skills remain in `.agents/skills`, where Codex discovers repository skills.

The primary agent handles planning/discussion with Astra High and hands agreed
implementation to `implementer` and review to `reviewer`, both Luna High.
Custom role files configure spawned agents; they do not switch the parent model
when the user toggles Plan mode. If delegation is unavailable, disclose that
limitation and use the interface's model selector for direct Luna implementation.
Do not claim automatic switching based only on Markdown instructions.

These files do not change approval, sandbox, provider, or credential settings.
Keep them in Git and write agent guidance in English. `AGENTS.md` contains prose
rules; `.codex/rules/*.rules` is for command execution policy, not a replacement
for project instructions. No command execution policy changes are needed here.

Official references:

- [Subagents and custom roles](https://learn.chatgpt.com/docs/agent-configuration/subagents)
- [AGENTS.md discovery](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
- [Local skill discovery](https://learn.chatgpt.com/docs/build-skills)

## Starting a task

1. Read the current request, `AGENTS.md`, Git status, and relevant code.
   Identify existing changes to avoid overwriting unrelated work.
2. Select the model for the current activity using the
   [model routing rules](../AGENTS.md#6-model-selection-by-activity), then select the
   relevant skill. Find documentation by feature name or FR/UC/BR/TC
   identifier; a small fix does not require reading all of BRD and SRS.
3. State the intended outcome and material assumptions briefly. Implement clear
   requests directly; task-list numbering does not mandate execution order.
4. Implement and validate within scope. Distinguish completed work from behavior
   that depends on components not yet available.
5. Review the final diff, update affected documentation, and report validation evidence.

## Choosing a skill

| Skill                                                                       | Use for                                              | Example request                                                                            |
| --------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| [nexora-backend](../.agents/skills/nexora-backend/SKILL.md)                 | NestJS APIs and business logic                       | "Use $nexora-backend to implement Customer registration according to UC-01."               |
| [nexora-frontend](../.agents/skills/nexora-frontend/SKILL.md)               | React screens, forms, and API calls                  | "Use $nexora-frontend to build the login screen from the SRS."                             |
| [nexora-docker-postgres](../.agents/skills/nexora-docker-postgres/SKILL.md) | Containers, configuration, databases, and migrations | "Use $nexora-docker-postgres to diagnose why auth-service cannot connect to its database." |
| [nexora-docs](../.agents/skills/nexora-docs/SKILL.md)                       | Markdown and design synchronization                  | "Use $nexora-docs to document the registration feature just implemented."                  |

Use `$skill-name` when supported. Otherwise ask the agent to read and apply
`.agents/skills/<skill-name>/SKILL.md`. A task may need multiple skills, such as
backend and database; load only the relevant guidance.

## Available validation commands

Run commands from the repository root using the Node/npm versions in
`package.json`. Use `npm ci` when installing dependencies from the existing
lockfile. For Auth, for example:

```powershell
npm run typecheck --workspace=@nexora/auth-service
npm run lint --workspace=@nexora/auth-service
npm run test --workspace=@nexora/auth-service
npm run build --workspace=@nexora/auth-service
```

Substitute the affected backend workspace. For frontend:

```powershell
npm run typecheck --workspace=@nexora/frontend
npm run lint --workspace=@nexora/frontend
npm run build --workspace=@nexora/frontend
```

Frontend currently has no test runner/script. Check relevant browser flows when
tools are available. Add automated testing tools when justified by feature scope,
rather than assuming a test framework is already installed.

| Change                          | Appropriate validation                                                                             |
| ------------------------------- | -------------------------------------------------------------------------------------------------- |
| Markdown/skills                 | Prettier on edited files, relative links, consistency, `git diff --check`                          |
| Backend within one workspace    | Typecheck, lint, relevant unit tests, build; integration checks for DB or service boundaries       |
| Frontend                        | Typecheck, lint, build; affected flows, errors, loading/empty states, responsive layout            |
| Shared dependency/configuration | Affected workspaces; root scripts when the change spans the repository                             |
| Compose/Dockerfile/init scripts | `docker compose config --quiet`; build/start affected services when runtime verification is needed |
| Migrations/schema               | Apply on an isolated test database; check constraints and upgrades from the previous schema        |

Root `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` execute
workspaces that define the corresponding script. Root `npm test` currently does
not test frontend. Treat `npm run test:e2e` as unavailable until real configuration
and suites have been added.

Example documentation checks:

```powershell
npx --no-install prettier --check AGENTS.md .codex/README.md
git diff --check
```

`git diff` does not show untracked file contents. Also inspect `git status --short`
and read new files. See [README](../README.md) for running the stack and
preserving database volumes.

## Maintaining these instructions

- When implementation status changes, update `AGENTS.md` and relevant
  README/Architecture sections.
- Change shared rules in `AGENTS.md`; link to them from skills instead of copying them.
- Add recurring task-specific knowledge to the relevant skill. Create a new skill
  only when its scope and activation conditions are meaningfully different.
- Do not record temporary session state, old test results, or secrets as permanent
  facts. Each agent must verify the actual environment when starting work.
