---
name: nexora-docs
description: Update Nexora Markdown requirements, architecture, database design and agent guidance consistently with code and agreed scope. Use for repository documentation or design synchronization; Word and PDF editing are outside this skill.
---

# Nexora Markdown Documentation

Read [AGENTS.md](../../../AGENTS.md) and the [development rules](../../../AGENTS.md#development-rules).
Paths below are relative to the repository root. Write agent guides, rules,
skills, metadata, and usage examples in English. Preserve the language of other
project documents unless translation is requested.

## Select affected documents

| Change                                      | Documents to consider                                                             |
| ------------------------------------------- | --------------------------------------------------------------------------------- |
| Startup, environment, containers            | Architecture run instructions                                                     |
| Modules, shared transactions, communication | `docs/Folder-ARCHITECTURE.md`, relevant SRS/Database sections                     |
| Business flows and rules                    | `docs/BRD.md`, `docs/SRS.md`, Database constraints                                |
| Schema/data types                           | `docs/DATABASE_DESIGN.md`, Architecture ownership, SRS API contracts              |
| Research/recommendation scope               | `docs/REQUIREMENTS_AND_RESEARCH_SCOPE.md`, relevant BRD/SRS/Architecture sections |
| Agent conventions/current status            | `AGENTS.md`, `.codex`, affected skills                                            |

## Workflow

1. Identify accepted decisions and compare them with code/configuration. Label
   implemented behavior, future design, and proposals requiring a decision.
2. Use `rg` to find Markdown references: service names, environment variables,
   databases, routes, diagrams, ownership tables, and directory trees. `docs/task`
   is ignored and may be absent; use it only when available and relevant, never
   as the sole source of requirements.
3. Edit affected passages by meaning. Avoid context-free global replacements:
   traceability tables, links/anchors, examples, and history may need different edits.
4. Preserve BREQ/BR/FR/UC/TC identifiers and traceability. When requirements change,
   update corresponding acceptance cases as well as descriptions.
5. Keep the shared-database modular monolith consistent across documents.
   When cleanup is requested, remove superseded configuration and provider
   instructions while preserving FR/UC/TC and task identifiers.
   Writing schema/diagrams does not implement migrations, business modules or AI.
6. Update version/date/history when the document has that convention and the change
   affects design. Do not bump unrelated documents just to align dates.

## Review before handoff

- Check superseded names/content, Markdown tables, code fences, Mermaid, file links,
  and affected anchors.
- Preserve UTF-8. On Windows, read Vietnamese documents explicitly as UTF-8 before
  diagnosing broken accents; terminal rendering alone does not justify conversion.
- Format edited files and run `git diff --check`. Also read new untracked files.
- Do not edit Word/PDF files or research artifacts for a Markdown documentation task.

Report synchronized documents and unresolved decisions. Markdown-only edits do
not require starting Docker or running backend tests.
