# Repository Guidelines

## User Info

User is a "vibe coder" and nontechnical. He understands the general concept of the code, but it's important to explain problems and ideas in a conceptual way, and not assume technical knowledge, even if he uses technical jargon. He will often copy errors and brute force a solution, so when presented with an error or a question, have this context in mind.

## Project Structure & Module Organization
- apps/orchestrator: TypeScript Express API (HeadCoach). Entry: `src/server.ts`. Routes in `src/routes`, agents/tools in `src/agents` and `src/tools`, config in `src/config`.
- apps/ui: Streamlit app (`apps/ui/app.py`) calling orchestrator via SSE/HTTP.
- packages/data: Prisma schema and generated client.
- Root: npm workspaces (`apps/*`, `packages/*`) via `pnpm-workspace.yaml` and root `package.json`.

## Build, Test, and Development Commands
- Install deps: `npm install` (workspace-aware).
- Orchestrator dev: `npm run -w @yahoo-fantasy-bot/orchestrator dev` (TS + nodemon).
- Orchestrator build: `npm run -w @yahoo-fantasy-bot/orchestrator build` → outputs to `apps/orchestrator/dist`.
- Orchestrator start: `npm run -w @yahoo-fantasy-bot/orchestrator start`.
- UI dev: `pip install streamlit sseclient-py requests` then `streamlit run apps/ui/app.py`.
- Prisma: `cd packages/data && npx prisma generate && npx prisma migrate dev`.

## Coding Style & Naming Conventions
- TypeScript: strict mode enabled. Use 2‑space indent, semicolons, single quotes, and explicit types where reasonable.
- Naming: files/folders kebab/lowercase; functions/variables `camelCase`; types/interfaces `PascalCase`.
- Module boundaries: routes-only under `src/routes`; business logic in `src/agents`/`src/tools`; configuration in `src/config`.

## Testing Guidelines
- Frameworks: prefer Jest/Vitest for TypeScript; Pytest for Streamlit helpers.
- Location: place TS tests alongside code at `src/**/__tests__/*.test.ts`.
- Focus: unit test guards (e.g., `guards/shouldExecute.ts`) and route handlers. Keep tests fast and deterministic.
- Run: use your chosen runner locally; ensure builds pass and typecheck is clean before PR.

## Security & Configuration Tips
- Env: copy `apps/orchestrator/env.example` to `.env` and set `DATABASE_URL`, `ALLOWED_ORIGINS`, Yahoo OAuth keys, `ANTHROPIC_API_KEY`, `AI_MODEL`, `EXECUTION_MODE`.
- Secrets: never commit credentials; respect CORS via `ALLOWED_ORIGINS` to match your UI host.
- AI: Vercel AI SDK with Anthropic; model configured in `apps/orchestrator/src/ai.ts` (override via `AI_MODEL`).
- Execution modes: `stage` (default), `dry-run`, `live` for post-draft automation.

## Commit & Pull Request Guidelines
- Commits: use Conventional Commits (e.g., `feat: add daily report SSE`, `fix: oauth callback error handling`).
- PRs: include a clear summary, linked issue (if any), setup/repro steps, and screenshots or curl examples for new endpoints. Note any env or schema changes (`packages/data/prisma/schema.prisma`). Ensure build + typecheck pass and new code is covered by tests where added.

