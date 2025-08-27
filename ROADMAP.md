# HeadCoach MVP Roadmap

This roadmap outlines the key milestones and tasks required to ship the Minimum Viable Product (MVP) of the Yahoo Fantasy "HeadCoach" agent. 

## 🚀 **Current Status: MVP COMPLETE, READY FOR DEPLOYMENT**

**Milestones 1-6**: ✅ **COMPLETED** - Full MVP functionality operational  
**Next Steps**: Deploy to production and optionally add Phase 2 enhancements

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

## Milestone 2: Yahoo OAuth Integration ✅

**Goal:** Enable users to authenticate with their Yahoo account and securely store their tokens.
**Status:** COMPLETED - Full OAuth flow operational with token persistence and refresh.

| Task                               | Status      | Dependencies       |
| ---------------------------------- | ----------- | ------------------ |
| **2.1: Create Yahoo OAuth App**    | Done        | -                  |
| - Get Client ID & Secret           | Done        | 2.1                |
| **2.2: Implement OAuth Routes**    | Done        | M1                 |
| - Create `/oauth/start` endpoint   | Done        | 2.2                |
| - Create `/oauth/callback` endpoint| Done        | 2.2                |
| **2.3: Token Persistence**         | Done        | M1 (Prisma)        |
| - Save tokens to `YahooToken` table| Done        | 2.3                |
| - Implement token refresh logic    | Done        | 2.3                |
| **2.4: Yahoo Service**             | Done        | 2.3                |
| - Create `yfForUser` service       | Done        | 2.4                |

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

## Milestone 3: Core Agent & Tooling ✅

**Goal:** Implement the main `HeadCoach` agent using the Vercel AI SDK and create stubbed versions of all required tools.
**Status:** COMPLETED - Core agent and all tools operational with SSE streaming.

| Task                               | Status      | Dependencies       |
| ---------------------------------- | ----------- | ------------------ |
| **3.1: Setup Vercel AI SDK**       | Done        | M1                 |
| - Add `ai` and `@ai-sdk/anthropic` | Done        | 3.1                |
| **3.2: Create `HeadCoach` Agent**  | Done        | 3.1                |
| - Implement `runHeadCoach` function| Done        | 3.2                |
| - Define system prompt             | Done        | 3.2                |
| **3.3: Stub Tools**                | Done        | M1                 |
| - Create `scout` tool (stubbed)    | Done        | 3.3                |
| - Create `analyst` tool (stubbed)  | Done        | 3.3                |
| - Create `executor` tool (stubbed) | Done        | 3.3                |
| - Create `historian` tool (stubbed)| Done        | 3.3                |
| **3.4: Implement Report Route**    | Done        | 3.2, 3.3           |
| - Create `GET /reports/daily`      | Done        | 3.4                |
| - Stream agent response via SSE    | Done        | 3.4                |

**Acceptance Criteria:**
- Calling `GET /reports/daily` triggers the `runHeadCoach` agent.
- The agent streams back a text response over SSE.
- The `executor` tool correctly stages a `Recommendation` in the database.

---

## Milestone 4: Approval Workflow ✅

**Goal:** Build the API endpoints required for the user to review and act on staged recommendations.
**Status:** COMPLETED - Full approval workflow operational with Yahoo API integration.

| Task                               | Status      | Dependencies       |
| ---------------------------------- | ----------- | ------------------ |
| **4.1: List Pending Route**        | Done        | M1 (Prisma)        |
| - Create `GET /approvals/pending`  | Done        | 4.1                |
| **4.2: Approve/Reject Routes**     | Done        | M2 (Yahoo Service) |
| - Create `POST /approvals/approve` | Done        | 4.2                |
| - Create `POST /approvals/reject`  | Done        | 4.2                |
| **4.3: Yahoo Execution Logic**     | Done        | 4.2                |
| - Implement Yahoo API calls        | Done        | 4.3                |
|   (e.g., add/drop, set lineup)     |             |                    |

**Acceptance Criteria:**
- `GET /approvals/pending` returns a list of recommendations with `status: 'STAGED'`.
- `POST /approvals/approve` executes the transaction via the Yahoo API and updates the recommendation status to `EXECUTED`.
- `POST /approvals/reject` updates the recommendation status to `REJECTED`.

---

## Milestone 5: Streamlit UI ✅

**Goal:** Create a functional user interface for interacting with the HeadCoach agent.
**Status:** COMPLETED - Functional UI with all core features operational.

| Task                               | Status      | Dependencies       |
| ---------------------------------- | ----------- | ------------------ |
| **5.1: Basic App Setup**           | Done        | -                  |
| - Initialize Streamlit app         | Done        | 5.1                |
| - Configure API base URL           | Done        | 5.1                |
| **5.2: Daily Report View**         | Done        | M3                 |
| - Add "Run Daily Report" button    | Done        | 5.2                |
| - Render SSE stream as markdown    | Done        | 5.2                |
| **5.3: Approvals UI**              | Done        | M4                 |
| - Fetch and display pending items  | Done        | 5.3                |
| - Add "Approve" & "Reject" buttons | Done        | 5.3                |
| **5.4: On-Demand Action Buttons**  | Done        | M3                 |
| - Add "Check Lineup" button        | Done        | 5.4                |
| - Add "Run Waivers" button         | Done        | 5.4                |

**Acceptance Criteria:**
- The user can trigger and view a streaming daily report.
- The user can view, approve, and reject pending recommendations.
- All on-demand actions are functional.

---

## Milestone 6: Scheduler & Policy ✅

**Goal:** Implement the automated daily job and the core business logic for auto-execution.
**Status:** COMPLETED - Policy and scheduler operational, pending deployment cron setup.

| Task                               | Status      | Dependencies       |
| ---------------------------------- | ----------- | ------------------ |
| **6.1: Implement Policy Logic**    | Done        | -                  |
| - Create `policy.ts` config file   | Done        | 6.1                |
| - Implement `shouldAutoExecute`    | Done        | 6.1                |
|   guard function                   |             |                    |
| - Write unit tests for the guard   | Done        | 6.1                |
| **6.2: Integrate Policy**          | Done        | M3, 6.1            |
| - Use `shouldAutoExecute` in the   | Done        | 6.2                |
|   `executor` tool                  |             |                    |
| **6.3: Scheduler Route**           | Done        | M3                 |
| - Create `GET /scheduler/hourly`   | Done        | 6.3                |
| - Add Luxon for time zone logic    | Done        | 6.3                |
| - Gate execution to 10 PM ET       | Done        | 6.3                |
| **6.4: Configure Cron Job**        | Pending     | 6.3                |
| - Set up external cron (e.g., on   | Pending     | 6.4                |
|   deployment platform)             |             |                    |

**Acceptance Criteria:**
- The `shouldAutoExecute` function correctly implements the policy rules.
- The `executor` tool auto-executes actions that meet the policy criteria.
- The hourly cron job successfully triggers the daily report once per day at the correct time.

---

## Milestone 7: MCP Servers for Tools

**Goal:** Implement standalone MCP servers that back each tool with structured I/O and (where applicable) reasoning.

| Task                                  | Status      | Dependencies |
| ------------------------------------- | ----------- | ------------ |
| **7.1: Define Schemas**               | To Do       | M3           |
| - Zod/JSON schemas for each tool I/O  | To Do       | 7.1          |
| **7.2: Scout MCP**                    | To Do       | 7.1          |
| **7.3: Analyst MCP**                  | To Do       | 7.1          |
| **7.4: Executor MCP**                 | To Do       | 7.1          |
| **7.5: Historian MCP**                | To Do       | 7.1          |
| **7.6: Recall MCP**                   | To Do       | 7.1          |
| **7.7: Orchestrator Integration**     | To Do       | 7.2–7.6      |

**Acceptance Criteria:**
- Orchestrator tool calls delegate to MCP servers and accept structured JSON.
- Local stubs remain available as fallback for development.
- Weekly Summary uses Recall/ Historian MCP to persist goals/todos and assess progress.

**Notes:**
- MCP servers can embed reasoning models to produce structured outputs; the orchestrator remains the policy/guard surface.

---

## Phase 2: Enhanced AI Architecture & Data Integration

**Goal:** Transform the basic MVP into a sophisticated fantasy football assistant with advanced reasoning, comprehensive data sources, and persistent memory capabilities.

### Milestone 7.5: Rube MCP Integration - Data Enhancement Layer ⚡

**Goal:** Replace mock external data services with live sources via Rube MCP while preserving HeadCoach's strategic reasoning capabilities.
**Status:** ✅ COMPLETED - Enhanced data foundation implemented and tested

**Approach:** Integrate Rube MCP's 500+ tools to enhance data gathering without replacing the core fantasy football intelligence. HeadCoach remains the strategic reasoner with significantly upgraded data inputs.

| Task                                    | Status      | Dependencies       |
| --------------------------------------- | ----------- | ------------------ |
| **7.5.1: Live Data Foundation**         | ✅ Done     | M3 (Core Agent)    |
| - Replace weather stubs with live APIs  | ✅ Done     | 7.5.1             |
| - Add sportsbook tools for Vegas lines  | ✅ Done     | 7.5.1             |
| - Test data quality and error handling  | ✅ Done     | 7.5.1             |
| **7.5.2: Social Intelligence Layer**    | ✅ Done     | 7.5.1             |
| - Add Reddit search for injury intel    | ✅ Done     | 7.5.2             |
| - Integrate web search for beat reporters | ✅ Done   | 7.5.2             |
| - Enhance scout tool with social data   | ✅ Done     | 7.5.2             |
| **7.5.3: Advanced Data Fusion**         | ✅ Done     | 7.5.2             |
| - Enhance analyst with breaking news    | ✅ Done     | 7.5.3             |
| - Add trend analysis for waiver targets | ✅ Done     | 7.5.3             |
| - Implement parallel data execution     | ✅ Done     | 7.5.3             |
| **7.5.4: Testing & Optimization**       | ✅ Done     | 7.5.3             |
| - End-to-end testing with live data    | ✅ Done     | 7.5.4             |
| - Performance optimization             | ✅ Done     | 7.5.4             |
| - Documentation updates                | ✅ Done     | 7.5.4             |

**Architecture:** 
```
HeadCoach (Strategic Reasoner) - PRESERVED
    ↓
Enhanced Scout (Yahoo API + Rube Social Intel) - ENHANCED
    ↓  
Analyst (Existing Logic + Richer Context) - ENHANCED
    ↓
Executor (Existing Policy Engine) - PRESERVED
    ↓
Historian (Existing Audit Trail) - PRESERVED
```

**Key Tools:**
- `REDDIT_SEARCH_ACROSS_SUBREDDITS` - Player injury discussions
- `WEB_SEARCH` - Beat reporter news and trends  
- Weather APIs - Live game conditions
- Sportsbook tools - Real betting odds and totals
- `RUBE_REMOTE_WORKBENCH` - Parallel data processing

**Benefits:**
- Real-time social sentiment replaces mock data
- Live weather/Vegas data for game script analysis
- Enhanced decision-making through richer context
- Maintained fantasy football intelligence and reasoning
- Simplified maintenance through managed API integrations

**Acceptance Criteria:**
- ExternalDataService stubs replaced with live Rube data sources
- Social intelligence (Reddit/web) integrated into scout tool
- Weather and betting data flowing into analyst recommendations
- All existing HeadCoach reasoning and confidence scoring preserved
- Performance meets or exceeds current mock data response times

### Milestone 8: Analyst Sub-Agent & Advanced Reasoning

**Goal:** Implement a dedicated Analyst sub-agent for complex analysis tasks and enhance the existing tool architecture.

| Task                                    | Status      | Dependencies       |
| --------------------------------------- | ----------- | ------------------ |
| **8.1: Analyst Sub-Agent Implementation** | To Do    | M3 (Core Agent)    |
| - Create `AnalystAgent` class with Claude Haiku | To Do | 8.1               |
| - Implement multi-factor waiver analysis       | To Do | 8.1               |
| - Add advanced lineup optimization logic        | To Do | 8.1               |
| - Create structured output parsing              | To Do | 8.1               |
| **8.2: Enhanced Tool Integration**        | To Do       | 8.1                |
| - Update analyst tool to use sub-agent   | To Do       | 8.2                |
| - Add confidence scoring algorithms       | To Do       | 8.2                |
| - Implement reasoning explanation system  | To Do       | 8.2                |

**Acceptance Criteria:**
- HeadCoach agent delegates complex analysis to Analyst sub-agent
- Waiver recommendations include multi-factor confidence scores
- Lineup optimization considers weather, matchups, and game scripts
- All recommendations include clear reasoning explanations

### Milestone 9: Comprehensive External Data Integration

**Goal:** Integrate real external data sources to enhance decision-making capabilities.

| Task                                    | Status      | Dependencies       |
| --------------------------------------- | ----------- | ------------------ |
| **9.1: News Aggregation System**         | To Do       | M8                 |
| - Implement The Athletic data integration | To Do       | 9.1                |
| - Add RotoBaller RSS feed parsing         | To Do       | 9.1                |
| - Create ESPN news aggregation            | To Do       | 9.1                |
| - Build news sentiment analysis          | To Do       | 9.1                |
| **9.2: Reddit Sentiment Analysis**       | To Do       | 9.1                |
| - Integrate Reddit API for r/fantasyfootball | To Do   | 9.2                |
| - Create player mention tracking          | To Do       | 9.2                |
| - Implement upvote/comment sentiment scoring | To Do     | 9.2                |
| **9.3: Weather & Vegas Integration**      | To Do       | 9.1                |
| - Add OpenWeatherMap API integration      | To Do       | 9.3                |
| - Implement Odds API for Vegas lines      | To Do       | 9.3                |
| - Create fantasy impact assessment        | To Do       | 9.3                |
| **9.4: Expert Data Sources**             | To Do       | 9.1                |
| - Integrate FantasyPros expert consensus  | To Do       | 9.4                |
| - Add multi-source trade value aggregation | To Do     | 9.4                |
| - Implement expert ranking analysis       | To Do       | 9.4                |
| **9.5: Caching & Rate Limiting**         | To Do       | 9.1-9.4            |
| - Implement Redis caching layer          | To Do       | 9.5                |
| - Add API rate limiting and throttling    | To Do       | 9.5                |
| - Create fallback mechanisms             | To Do       | 9.5                |

**Acceptance Criteria:**
- All external data sources operational with appropriate caching
- News sentiment analysis influences player recommendations
- Weather and Vegas data integrated into lineup decisions
- Rate limiting prevents API quota issues

### Milestone 10: Journal-Based Memory System

**Goal:** Implement persistent memory and context handoff capabilities for team learning and continuity.

| Task                                    | Status      | Dependencies       |
| --------------------------------------- | ----------- | ------------------ |
| **10.1: Database Schema Enhancement**    | To Do       | M1 (Database)      |
| - Add TeamJournal and Memory models     | To Do       | 10.1               |
| - Create database migration             | To Do       | 10.1               |
| - Update Prisma client                  | To Do       | 10.1               |
| **10.2: Journal System Implementation** | To Do       | 10.1               |
| - Create markdown journal persistence   | To Do       | 10.2               |
| - Implement journal section updates     | To Do       | 10.2               |
| - Add decision logging with outcomes    | To Do       | 10.2               |
| **10.3: Memory Recall System**         | To Do       | 10.2               |
| - Build context recall functionality    | To Do       | 10.3               |
| - Create weekly goal tracking          | To Do       | 10.3               |
| - Implement decision accuracy metrics   | To Do       | 10.3               |
| **10.4: Enhanced Historian Tool**       | To Do       | 10.2, 10.3         |
| - Update historian with journal features | To Do      | 10.4               |
| - Add memory handoff between sessions   | To Do       | 10.4               |
| - Create team performance tracking      | To Do       | 10.4               |

**Acceptance Criteria:**
- Team journal persists in human-readable markdown format
- Decision history tracked with outcome analysis
- Context handed off between agent sessions
- Weekly goals and progress tracked automatically

---

---

# 🎉 **MVP STATUS: READY FOR DEPLOYMENT!**

**Current State:** All core MVP milestones (M1-M6) are **COMPLETED**. The system is fully functional locally and ready for deployment.

**What's Working:**
- ✅ Complete Yahoo Fantasy OAuth integration 
- ✅ AI-powered HeadCoach agent with Vercel AI SDK
- ✅ All tools (scout, analyst, executor, historian) operational
- ✅ Policy-driven auto-execution with confidence thresholds
- ✅ Full approval workflow for staged recommendations  
- ✅ Streamlit UI with SSE streaming reports
- ✅ Scheduler with timezone-aware daily execution
- ✅ Database schema with Supabase + Prisma

**Remaining Work:**
1. **Deployment** (Milestone 11) - Deploy to production
2. **MCP Servers** (Milestone 7) - Optional enhancement  
3. **Phase 2 Features** (M8-M10) - Enhanced data & sub-agents

---

## Milestone 11: Deployment & Shipping

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
