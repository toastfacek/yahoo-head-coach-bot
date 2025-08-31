# Progress Log

## Date
- 2025-08-28

## Context
- Pivot to Discord as the main chat interface with the orchestrator backend hosting agents and Yahoo actions.

## Current State (Summary)
- Discord bot: Slash commands (`/auth`, `/lineup`, `/waivers`, `/approvals`) plus DM/mention NLP. Streams chat to orchestrator.
- Orchestrator: HeadCoach agent chains `scout → analyst → executor → historian`; SSE endpoints for chat and reports.
- OAuth: `/api/oauth/start|callback|status|refresh` implemented; tokens stored in Postgres (`YahooToken`).
- Data model: `DiscordUser` table supports linking Discord IDs to app `User` and `isAuthenticated` flag.
- Yahoo: Direct API client with token refresh; policy-gated execution via `proposeOrExecute`.

## Gaps Blocking E2E Actions
- OAuth linking not reflected in `DiscordUser` (`isAuthenticated`/`userId`) after callback; bot can’t see users as authenticated.
- Bot expects `/api/leagues` but orchestrator lacks this route; league discovery blocked.
- API contract mismatches:
  - Lineup/Waivers routes return `{ text }` but bot expects `FantasyReportData`.
  - Approvals list/approve/reject shapes don’t match bot expectations (`created_at`, `data`, `success`).
- Execution gaps:
  - `LINEUP_SWAP` edit path not wired in wrapper; `WAIVER` path missing `teamKey` in request.
- Startup robustness: DB proxy can throw before async `connectDatabase()` completes.
- Default `EXECUTION_MODE=stage` prevents live actions.

## Plan
1) OAuth linking: update callback to link `DiscordUser` and align `/oauth/status` to `{ authenticated, userInfo }`.
2) Leagues route: add `GET /api/leagues?userId=...` returning normalized league list.
3) Contract alignment: lineup/waivers return `FantasyReportData`; approvals payloads normalized; approve/reject return `{ success: true }`.
4) Yahoo execution fixes: include `teamKey` in WAIVER call; implement `team.roster().edit` wrapper -> `updateRosterPositions`.
5) Config: allow `EXECUTION_MODE=live` in prod once verified.
6) Validate end-to-end via slash commands and DM flow.

## Next Actions (this change set)
- Implement items 1–4 above and verify locally with lint/format.

## Update — 2025-08-29
### Completed
- Linked Discord users on OAuth callback; `/oauth/status` returns `{ authenticated, userInfo }`.
- Added `GET /api/leagues?userId=...` (NFL) and wired router.
- Aligned contracts:
  - `/lineup/check`, `/waivers/run` return `FantasyReportData` shape.
  - Approvals list normalized; approve/reject return `{ success: true, ok: true }`.
  - Execution failures now return consistent error objects; missing-parameter reasons mapped to HTTP 400.
- Fixed Yahoo execution paths for `WAIVER` (include `teamKey`) and `LINEUP_SWAP` (implemented `roster().edit`).
- Ran Prettier/ESLint and pushed branch. All orchestrator tests passing (8 files, 112 tests).

### Next Actions
- Run end-to-end Discord smoke: `/auth login` → callback → `/auth status` → `/lineup` → `/waivers` → `/approvals` approve.
- Set `EXECUTION_MODE=live` in production after validation; monitor first executions.
- Improve agent output to populate structured `lineup`/`waivers` arrays (not only summary text); consider typed tool outputs.
- Persist preferred league per Discord user and cache leagues to reduce Yahoo calls.
- Harden DB startup (lazy-connect or queue) to avoid early request failures; consider retries.
- Observability: enrich logs with request IDs and add error telemetry/metrics.
- Security: move OAuth `stateStore` to Redis/DB; review CORS/headers.
- CI: add smoke tests for `/leagues` and approvals route; consider minimal discord-bot tests.
- Docs: add curl smoke scripts and update README with Discord + OAuth flow.
