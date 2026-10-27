---
name: nexora-frontend
description: Build or fix Nexora React/Vite screens, forms and API integration according to the ecommerce SRS. Use for frontend/src and browser behavior; does not cover backend business logic or external website publishing.
---

# Nexora Frontend Development

Read [AGENTS.md](../../../AGENTS.md) and the [development rules](../../../AGENTS.md#development-rules).
Code paths below are relative to the repository root.

## Prepare

- Inspect `frontend/package.json`, `src`, `vite.config.ts`, and affected screens.
  Frontend has React Router, an Auth API client and integrated Auth screens.
  Inspect those conventions; add dependencies only when the feature needs them.
- Find relevant use cases, screens, validation, and error behavior in `docs/SRS.md`.
  Verify an API exists before integration; planned contracts do not prove the
  backend has been implemented.
- Identify success, loading, empty, error, and authorization states for the screen.

## Implement

- Use Vietnamese product UI, VND formatting, and Vietnamese local time. Preserve
  IDs as strings across forms, state, and API calls.
- Call `/api/...` through the Vite proxy directly to backend:3000 in Compose or localhost:3000 on the host. Do not embed container
  DNS names or backend credentials in browser bundles.
- Treat frontend environment variables as public data. Keep PostgreSQL passwords,
  Supabase database/server keys or payOS secrets, and system tokens out of `VITE_*` variables.
- For unavailable APIs, use mocks only when appropriate for the UI task. Separate
  mocks from real integration and disclose the limitation; do not present mock
  mutations as persisted data.
- Provide form labels, field-specific errors, keyboard interaction, and submission
  states. Check mobile and desktop layouts, preserving input after recoverable errors.
- Cart/checkout UI follows server state. Disabling a button only reduces repeated
  clicks; retries of the same operation must preserve the contract's idempotency
  key. A payOS redirect must not mark an order PAID locally.
- Distinguish rule-based recommendation fallback from model output. Core shopping
  flows must handle recommendations being unavailable.

## Validate

Run typecheck, lint, and build for `nexora-frontend`. There is currently no
frontend test script; root `npm test` does not validate UI behavior.
When browser tools are available, exercise relevant valid/invalid submissions,
API errors, empty states, keyboard interaction, and viewport sizes. Report any
visual checks that could not be performed.

Describe completed screens/flows, actual APIs used, and remaining mocks.
