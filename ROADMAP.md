# HeadCoach MVP Roadmap

This roadmap outlines the key milestones and tasks required to ship the Minimum Viable Product (MVP) of the Yahoo Fantasy "HeadCoach" agent. It is based on the detailed implementation plan.

---

## Milestone 1: Project Foundation & Server Skeleton ✅

**Goal:** Establish the monorepo structure, initialize the database, and get a basic Express server running.
**Status:** COMPLETED - All tasks done, server fully implemented and operational.

| Task                               | Status      | Dependencies |
| ---------------------------------- | ----------- | ------------ |
| **1.1: Bootstrap Monorepo**        | Done        | -            |
| - Initialize pnpm workspace        | Done        | 1.1          |
| - Create `apps` and `packages` dir | Done        | 1.1          |
| - Add root `typescript` & `dotenv` | Done        | 1.1          |
| **1.2: Setup Database (Supabase)** | Done        | -            |
| - Create Supabase project          | Done        | 1.2          |
| - Get `DATABASE_URL` secret        | Done        | 1.2          |
| **1.3: Initialize Prisma**         | Done        | 1.1, 1.2     |
| - Add Prisma to `data` package     | Done        | 1.3          |
| - Define initial `schema.prisma`   | Done        | 1.3          |
| - Run initial migration            | Done*       | 1.3          |
| - Generate Prisma client           | Done        | 1.3          |
| **1.4: Orchestrator Server**       | Done        | 1.1          |
| - Create Express server skeleton   | Done        | 1.4          |
| - Add health check endpoint        | Done        | 1.4          |
| - Run server locally               | Done        | 1.4          |

**Acceptance Criteria:**
- The project is buildable with `pnpm install`.
- The database schema is migrated in Supabase.
- The Express server runs and responds to a health check.

**Notes:**
- *Prisma introspection (`db pull`) has connection restrictions with Supabase, but this doesn't affect functionality since schema is defined and client is generated.
- Database tables are created and accessible via Supabase MCP.
- Prisma client is ready for use in application code.
- **Supabase MCP Integration:** Successfully used Supabase MCP to create project, apply database schema, and verify table creation.
- **Database Status:** 10 tables created including User, YahooToken, League, Team, Signal, Recommendation, Decision, LeagueSnapshot, and CostLog.
- **Orchestrator Implementation:** Express server includes security middleware (helmet, CORS), error handling, graceful shutdown, and modular routing system. Health endpoint at `/api/health` provides comprehensive status including uptime and environment info. Server structure exceeds MVP requirements with production-ready features.

---

## Milestone 2: Yahoo OAuth Integration

**Goal:** Enable users to authenticate with their Yahoo account and securely store their tokens.
**Status:** Tasks 2.1-2.2 completed - OAuth app created, credentials configured, and OAuth routes implemented.

| Task                               | Status      | Dependencies       |
| ---------------------------------- | ----------- | ------------------ |
| **2.1: Create Yahoo OAuth App**    | Done        | -                  |
| - Get Client ID & Secret           | Done        | 2.1                |
| **2.2: Implement OAuth Routes**    | Done        | M1                 |
| - Create `/oauth/start` endpoint   | Done        | 2.2                |
| - Create `/oauth/callback` endpoint| Done        | 2.2                |
| **2.3: Token Persistence**         | To Do       | M1 (Prisma)        |
| - Save tokens to `YahooToken` table| To Do       | 2.3                |
| - Implement token refresh logic    | To Do       | 2.3                |
| **2.4: Yahoo Service**             | In Progress | 2.3                |
| - Create `yfForUser` service       | In Progress | 2.4                |

**Acceptance Criteria:**
- A user can go to `/oauth/start`, be redirected to Yahoo, log in, and be sent back to the callback.
- The `accessToken`, `refreshToken`, and `expiresAt` are correctly stored in the database, linked to a `userId`.

**Notes:**
- **Setup Documentation:** Comprehensive Yahoo OAuth app creation guide provided in `YAHOO_OAUTH_SETUP.md` with step-by-step instructions for Yahoo Developer Network registration.
- **Required Scope:** Fantasy Sports Read/Write access (`fspt-w`) needed for full bot functionality.
- **Environment Configuration:** Yahoo OAuth credentials successfully configured in `.env` file.
- **App Details:** Yahoo OAuth app created with App ID `98Ar6hH6`, Client ID and Secret configured for `http://localhost:3000/api/oauth/callback`.
- **OAuth Routes Implementation:** Complete OAuth 2.0 authorization code flow implemented in `src/routes/oauth.ts` with:
  - `/api/oauth/start` endpoint for initiating Yahoo authorization
  - `/api/oauth/callback` endpoint for handling callback and token exchange
  - CSRF protection via state parameter validation
  - Token persistence integration with Prisma YahooToken model
  - Comprehensive error handling for OAuth flow scenarios
  - Token refresh functionality for expired access tokens

---

## Milestone 3: Core Agent & Tooling

**Goal:** Implement the main `HeadCoach` agent using the Vercel AI SDK and create stubbed versions of all required tools.

| Task                               | Status      | Dependencies       |
| ---------------------------------- | ----------- | ------------------ |
| **3.1: Setup Vercel AI SDK**       | To Do       | M1                 |
| - Add `ai` and `@ai-sdk/anthropic` | To Do       | 3.1                |
| **3.2: Create `HeadCoach` Agent**  | In Progress | 3.1                |
| - Implement `runHeadCoach` function| To Do       | 3.2                |
| - Define system prompt             | To Do       | 3.2                |
| **3.3: Stub Tools**                | In Progress | M1                 |
| - Create `scout` tool (stubbed)    | In Progress | 3.3                |
| - Create `analyst` tool (stubbed)  | To Do       | 3.3                |
| - Create `executor` tool (stubbed) | To Do       | 3.3                |
| - Create `historian` tool (stubbed)| To Do       | 3.3                |
| **3.4: Implement Report Route**    | In Progress | 3.2, 3.3           |
| - Create `GET /reports/daily`      | In Progress | 3.4                |
| - Stream agent response via SSE    | To Do       | 3.4                |

**Acceptance Criteria:**
- Calling `GET /reports/daily` triggers the `runHeadCoach` agent.
- The agent streams back a text response over SSE.
- The `executor` tool correctly stages a `Recommendation` in the database.

---

## Milestone 4: Approval Workflow

**Goal:** Build the API endpoints required for the user to review and act on staged recommendations.

| Task                               | Status      | Dependencies       |
| ---------------------------------- | ----------- | ------------------ |
| **4.1: List Pending Route**        | To Do       | M1 (Prisma)        |
| - Create `GET /approvals/pending`  | To Do       | 4.1                |
| **4.2: Approve/Reject Routes**     | To Do       | M2 (Yahoo Service) |
| - Create `POST /approvals/approve` | To Do       | 4.2                |
| - Create `POST /approvals/reject`  | To Do       | 4.2                |
| **4.3: Yahoo Execution Logic**     | In Progress | 4.2                |
| - Implement Yahoo API calls        | In Progress | 4.3                |
|   (e.g., add/drop, set lineup)     |             |                    |

**Acceptance Criteria:**
- `GET /approvals/pending` returns a list of recommendations with `status: 'STAGED'`.
- `POST /approvals/approve` executes the transaction via the Yahoo API and updates the recommendation status to `EXECUTED`.
- `POST /approvals/reject` updates the recommendation status to `REJECTED`.

---

## Milestone 5: Streamlit UI

**Goal:** Create a functional user interface for interacting with the HeadCoach agent.

| Task                               | Status      | Dependencies       |
| ---------------------------------- | ----------- | ------------------ |
| **5.1: Basic App Setup**           | In Progress | -                  |
| - Initialize Streamlit app         | In Progress | 5.1                |
| - Configure API base URL           | To Do       | 5.1                |
| **5.2: Daily Report View**         | To Do       | M3                 |
| - Add "Run Daily Report" button    | To Do       | 5.2                |
| - Render SSE stream as markdown    | To Do       | 5.2                |
| **5.3: Approvals UI**              | To Do       | M4                 |
| - Fetch and display pending items  | To Do       | 5.3                |
| - Add "Approve" & "Reject" buttons | To Do       | 5.3                |
| **5.4: On-Demand Action Buttons**  | To Do       | M3                 |
| - Add "Check Lineup" button        | To Do       | 5.4                |
| - Add "Run Waivers" button         | To Do       | 5.4                |

**Acceptance Criteria:**
- The user can trigger and view a streaming daily report.
- The user can view, approve, and reject pending recommendations.
- All on-demand actions are functional.

---

## Milestone 6: Scheduler & Policy

**Goal:** Implement the automated daily job and the core business logic for auto-execution.

| Task                               | Status      | Dependencies       |
| ---------------------------------- | ----------- | ------------------ |
| **6.1: Implement Policy Logic**    | In Progress | -                  |
| - Create `policy.ts` config file   | In Progress | 6.1                |
| - Implement `shouldAutoExecute`    | To Do       | 6.1                |
|   guard function                   |             |                    |
| - Write unit tests for the guard   | To Do       | 6.1                |
| **6.2: Integrate Policy**          | To Do       | M3, 6.1            |
| - Use `shouldAutoExecute` in the   | To Do       | 6.2                |
|   `executor` tool                  |             |                    |
| **6.3: Scheduler Route**           | To Do       | M3                 |
| - Create `GET /scheduler/hourly`   | To Do       | 6.3                |
| - Add Luxon for time zone logic    | To Do       | 6.3                |
| - Gate execution to 10 PM ET       | To Do       | 6.3                |
| **6.4: Configure Cron Job**        | To Do       | 6.3                |
| - Set up external cron (e.g., on   | To Do       | 6.4                |
|   deployment platform)             |             |                    |

**Acceptance Criteria:**
- The `shouldAutoExecute` function correctly implements the policy rules.
- The `executor` tool auto-executes actions that meet the policy criteria.
- The hourly cron job successfully triggers the daily report once per day at the correct time.

---

## Milestone 7: Deployment & Shipping

**Goal:** Deploy all services and prepare for launch.

| Task                               | Status      | Dependencies       |
| ---------------------------------- | ----------- | ------------------ |
| **7.1: Prepare for Deployment**    | To Do       | M1-M6              |
| - Finalize all `.env.example` files| To Do       | 7.1                |
| - Create run scripts (`start`, etc)| To Do       | 7.1                |
| **7.2: Deploy Orchestrator**       | To Do       | 7.1                |
| - Choose platform (e.g., Railway)  | To Do       | 7.2                |
| - Deploy and configure env vars    | To Do       | 7.2                |
| **7.3: Deploy Streamlit UI**       | To Do       | 7.1                |
| - Choose platform (e.g., Streamlit | To Do       | 7.3                |
|   Cloud)                           |             |                    |
| - Deploy and configure API URL     | To Do       | 7.3                |
| **7.4: Final E2E Test**            | To Do       | 7.2, 7.3           |
| - Test the full user flow on the   | To Do       | 7.4                |
|   live, deployed application       |             |                    |

**Acceptance Criteria:**
- The orchestrator and UI are deployed and publicly accessible.
- All environment variables are correctly configured in the production environments.
- The full E2E test passes on the live application.
- **MVP SHIPPED!**
