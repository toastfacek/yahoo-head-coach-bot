# Repository Guidelines

## Project Structure & Modules
- apps/orchestrator: TypeScript Express API (HeadCoach orchestrator). Entry: `src/server.ts`; routes in `src/routes`, agents/tools in `src/agents` and `src/tools`, config in `src/config`.
- apps/ui: Lightweight Streamlit UI (`apps/ui/app.py`) that calls orchestrator endpoints via SSE/HTTP.
- packages/data: Prisma schema and database client.
- Root: npm workspaces (`apps/*`, `packages/*`). See `pnpm-workspace.yaml` and root `package.json`.

## Build, Test, and Development
- Install deps (workspaces): `npm install`
- Orchestrator dev: `npm run -w @yahoo-fantasy-bot/orchestrator dev` (TS + nodemon)
- Orchestrator build: `npm run -w @yahoo-fantasy-bot/orchestrator build` → outputs to `apps/orchestrator/dist`
- Orchestrator start: `npm run -w @yahoo-fantasy-bot/orchestrator start`
- UI dev: `pip install streamlit sseclient-py requests` then `streamlit run apps/ui/app.py`
- Prisma client/migrate: `cd packages/data && npx prisma generate && npx prisma migrate dev`

## Configuration & Security
- Copy env: `cp apps/orchestrator/env.example apps/orchestrator/.env` and set `DATABASE_URL`, `ALLOWED_ORIGINS`, Yahoo OAuth keys, `ANTHROPIC_API_KEY`, `AI_MODEL`, and `EXECUTION_MODE`.
- Never commit secrets. Respect CORS in `ALLOWED_ORIGINS` to match your UI host.

## Coding Style & Naming
- TypeScript: strict mode (see `tsconfig.json`). Use 2‑space indent, semicolons, single quotes, and explicit types where reasonable.
- Names: files/folders kebab/lowercase; functions/variables `camelCase`; types/interfaces `PascalCase`.
- Keep modules focused: routes-only under `src/routes`, business logic in `src/agents`/`src/tools`, config in `src/config`.

## AI Configuration
- SDK: Vercel AI SDK (`ai`) with Anthropic provider (`@ai-sdk/anthropic`).
- Model: configured in `apps/orchestrator/src/ai.ts`; override with `AI_MODEL`.

## Execution Modes
- `stage`: stage all recommendations in DB (default).
- `dry-run`: compute results without writing to DB.
- `live`: attempt execution for auto-eligible actions when league is post-draft.

## Testing Guidelines
- No test suite yet. Prefer: Jest/Vitest for TypeScript; Pytest for the Streamlit helpers.
- Place TS tests alongside code (`src/**/__tests__/*.test.ts`). Aim to unit test guards (e.g., `guards/shouldExecute.ts`) and route handlers.

## Commit & Pull Requests
- Commits: use Conventional Commits (e.g., `feat: add daily report SSE`, `fix: oauth callback error handling`).
- PRs: include a clear summary, linked issue (if any), setup/repro steps, and screenshots or curl examples for new endpoints. Note env or schema changes (`packages/data/prisma/schema.prisma`).
- CI expectations: builds pass, typecheck clean, and new code covered by tests where added.
