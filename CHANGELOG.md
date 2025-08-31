# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project adheres to Conventional Commits.

## [Unreleased]
- Initial CI pipeline (typecheck, tests, lint, format)
- Structured logging and rate limiting in orchestrator
- Env validation and execution modes (stage/dry-run/live)
- Vercel AI SDK centralization and error handling
- Scheduler route gated to 22:00 ET
- Token status/refresh endpoints and recommendation staging with policy guard

### Discord OAuth Flow Revamp (Planned and in progress)
- Design: Adopt a staff-level interaction model for reliability and UX.
  - Single-ack contract per command; no mixed reply/defer paths.
  - Fast path for `/auth login`: one-shot ephemeral reply with an embed + Link Button; no defer, no follow-ups.
  - `/auth status`: defer + editReply only (can be slow), rich embed with account/expiry info.
  - Ephemeral via `flags: 64` (no deprecated `ephemeral: true`).
  - Interaction idempotency: short-lived lock on `interaction.id` to avoid double-acks in multi-instance.
- Security & State: Move to short-lived signed OAuth sessions.
  - New orchestrator endpoint `POST /api/oauth/session` returns an `authorize_url` carrying `state=<signed JWT>`.
  - Back state storage in Redis with TTL + one-time consume; no `userId` in query strings.
  - Callback validates state/JWT, links `DiscordUser`, marks session consumed, returns success page.
- Bot UX updates:
  - `/auth login` calls session endpoint, renders embed with a primary Link Button and secondary "Check Status" button.
  - Add button handler `auth:status` that routes to the same status logic.
- Robustness & Observability:
  - Add interaction ack latency and end-to-end correlation IDs (interaction → session → callback).
  - Handle 40060/10062 as terminal (no retries); log and exit early.

### Updates Implemented (Stages 1–4)
- Stage 1 — Stabilize `/auth login` (bot):
  - Switched to one-shot reply (no defer) for login; eliminated double-ack (40060) and unknown interaction (10062) edge cases.
  - Uses `flags: MessageFlags.Ephemeral` instead of deprecated `ephemeral: true` where updated.
  - Background DB upsert (DiscordUser) runs without emitting additional messages.
- Stage 2 — Session + State (orchestrator):
  - Added `POST /api/oauth/session` returning `{ authorize_url }` built from `state=<HS256 JWT>` and consume-once state record (TTL) stored server-side.
  - Added lightweight JWT utils (HS256 sign/verify) and an in-memory `stateStore` with TTL + consume-once semantics (Redis-ready abstraction).
  - Added env keys: `OAUTH_STATE_JWT_SECRET`, `JWT_KID`, `REDIS_URL`.
- Stage 3 — Bot UX on sessions:
  - `orchestratorApi.createOAuthSession(discordId)` calls the new session endpoint.
  - `/auth login` now renders an embed with:
    - Primary Link Button: “Authorize with Yahoo” → `authorize_url`.
    - Secondary Button: “Check Status” → `customId=auth:status`.
  - Added `auth:status` button handling; defers + editReply with connected/expired/not-connected embed.
  - Converted error replies in interactions to use `flags: 64` where touched.
- Stage 4 — Signed-state only (orchestrator):
  - `/api/oauth/start` requires `state` (JWT) and consumes it prior to redirect; legacy `userId`/JSON state removed.
  - `/api/oauth/callback` validates and consumes signed state; legacy fallback removed. Clear error for invalid/expired state.
  - No PII appears in OAuth URLs; `state` is the only identifier.

### Stage 5 — Locks, Flags Cleanup, Smoke Script
- Interaction locks (bot): Added short-lived (5s) in-memory lock to dedupe `interaction.id` and avoid double-acks in multi-instance setups. File: `apps/discord-bot/src/services/lock.ts`; used in `handlers/interactions.ts`.
- Flags migration: Replaced deprecated `ephemeral: true` with `flags: MessageFlags.Ephemeral` in updated handlers (errors, select menu, approvals). Standardized `deferReply({ flags: 64 })` where applicable.
- Smoke testing: Added `scripts/smoke/oauth-session.sh` to create an OAuth session and print the `authorize_url`, plus a status verification curl hint.
- Observability notes: Current structured logs include `interactionId` and execution IDs for correlation; metrics hooks (ack latency, session timings) can be layered on top. Redis-backed locks and metrics exporters are the next step for production.

### Context Notes / Guidance
- Interaction hygiene:
  - For “fast” commands (e.g., login), reply once within 3s; avoid defer to eliminate ack races.
  - For “slow” commands (status, reports), use `deferReply` → `editReply` only; do not send a new reply post-defer.
  - Treat 40060 (already acknowledged) and 10062 (unknown/expired interaction) as terminal; do not retry messages.
- Ephemeral responses:
  - Prefer `flags: 64` over `ephemeral: true` to avoid deprecation warnings and be explicit.
- State & security:
  - State is a short-lived, signed JWT; the server stores a consume-once jti→discordId record with TTL (in-memory now; Redis in Stage 5).
  - Yahoo OAuth redirect carries only `state`; no `userId` is included in query strings.
- Multi-instance readiness:
  - Stage 5 will add a Redis-backed interaction lock on `interaction.id` to prevent double-acks when horizontally scaled.
- Observability:
  - Plan to add correlation IDs spanning Discord interaction → session creation → OAuth callback, plus ack latency metrics.
- Testing tips:
  - Manual: `POST /api/oauth/session` → open `authorize_url` → complete consent → `GET /api/oauth/status?userId=<discordId>`.
  - Discord: `/auth login` → click “Authorize with Yahoo” → click “Check Status” (or run `/auth status`).

### Implementation Plan
- Phase 1: Changelog + plan (this change) and stabilize `/auth login` one-shot reply.
- Phase 2: Orchestrator `POST /api/oauth/session` + Redis-backed state repository (with in-memory fallback for dev).
- Phase 3: Bot uses session endpoint; render embed + Link Button + "Check Status" button; replace all `ephemeral` with flags.
- Phase 4: Callback validation w/ JWT state + consume-once; update `/oauth/callback` accordingly; remove `userId` query usage.
- Phase 5: Add interaction lock (Redis), metrics, and correlation IDs; docs and smoke tests for the full flow.
