# Product Requirements: Yahoo Fantasy “HeadCoach”

**Version:** 1.1 (Updated based on Implementation Plan)
**Status:** In Development

## 1. Overview

Yahoo Fantasy "HeadCoach" is an automated agent that helps fantasy football managers optimize their teams. It provides daily reports, waiver wire recommendations, and lineup suggestions based on a configurable policy. The agent aims to increase a manager's probability of making the playoffs by making informed, data-driven decisions.

This document outlines the product requirements for the initial version (MVP).

## 2. Key Features (MVP)

### 2.1. Automated Daily Reports
- **Description:** Every day at a configurable time (default: 10:00 PM ET), the agent will generate a concise markdown report summarizing key team updates.
- **Content:**
    - **Injuries & News:** Significant updates on rostered players.
    - **Lineup Suggestions:** Recommended swaps for the upcoming week (e.g., moving a player from bench to an active slot).
    - **Waiver Wire Targets:** Top available players to consider adding.
- **Delivery:** The report will be viewable in a simple web UI (Streamlit). The UI will support real-time streaming of the report as it's generated.

### 2.2. Policy-Driven Automation
- **Description:** The agent's decisions are governed by a central policy file. This allows for transparent and configurable behavior.
- **Policy Rules (Initial):**
    - **Confidence Thresholds:**
        - **Auto-Execution:** Recommendations with a confidence score ≥ 80% are executed automatically.
        - **Manual Approval:** Recommendations with a confidence score between 60% and 79% are staged for manager approval.
    - **Free Agent Budget (FAB):**
        - **Auto-Execution:** Waiver bids that are ≤ 3% of the remaining FAB are executed automatically (if confidence threshold is also met).
    - **Injury Swaps:**
        - Automatically swap out any player with an "Out" injury status from the active lineup if a valid replacement is available on the bench.
- **Configuration:** The policy will be defined in a `policy.ts` file within the orchestrator service.

### 2.3. Manual Approval Workflow
- **Description:** Recommendations that do not meet the auto-execution criteria but are above the minimum staging threshold will be presented to the manager for approval.
- **Interface:** The Streamlit UI will display a list of pending recommendations.
- **Actions:** For each recommendation, the manager can:
    - **Approve:** Execute the transaction (e.g., submit the waiver claim, make the lineup change).
    - **Reject:** Dismiss the recommendation.

### 2.4. On-Demand Actions
- **Description:** In addition to the daily scheduled run, managers can trigger specific actions from the UI.
- **Actions:**
    - **Run Daily Report:** Manually generate the daily report.
    - **Check Lineup:** Trigger an immediate analysis and recommendation for the current lineup.
    - **Run Waivers:** Initiate the waiver wire analysis and generate recommendations.

## 3. Technical Architecture & Stack

- **Monorepo:** The project will be structured as a pnpm monorepo.
- **Backend Orchestrator:**
    - **Framework:** Node.js with Express.
    - **Language:** TypeScript.
    - **Core AI:** Vercel AI SDK with Anthropic Claude 3 Sonnet for the core agent logic.
    - **Scheduling:** An hourly cron job will trigger a scheduler endpoint, which will gate the daily run to 10:00 PM ET.
- **MCP Servers (Tool Backends):**
    - Each tool (scout, analyst, executor, historian, recall) is a thin wrapper over a Model Context Protocol (MCP) server.
    - The MCP server performs the reasoning (when needed) and returns structured JSON outputs that the orchestrator consumes.
    - Advantages: separation of concerns, reproducible structured I/O, and ability to scale/iterate reasoning independently of the web API.
- **Frontend UI:**
    - **Framework:** Streamlit (Python).
    - **Communication:** The UI will communicate with the backend via a REST API and Server-Sent Events (SSE) for streaming reports.
- **Database:**
    - **Provider:** Supabase (PostgreSQL).
    - **ORM:** Prisma.
    - **Schema:** The database will store user data, Yahoo OAuth tokens, league/team information, signals, recommendations, and decision logs.
- **Authentication:**
    - **Yahoo:** Securely connect to the Yahoo Fantasy API using 3-legged OAuth2. Tokens will be stored in the database.

## 4. Data & Signals (Scouting)

The agent will gather intelligence from various sources to inform its recommendations. For the MVP, these sources will be implemented as placeholders with the ability to be fully integrated post-MVP.

- **Initial Signals:**
    - Player News & Injuries
    - Team & Roster State (from Yahoo)
- **Future Signals (Post-MVP):**
    - Expert Analysis (e.g., Rotoballer, The Athletic)
    - Social Media Sentiment (e.g., Reddit, X)
    - Vegas Odds
    - Weather Forecasts

## 5. API Contract

The backend will expose the following REST endpoints for the UI:

- `GET /reports/daily`: Streams the daily report via SSE.
- `POST /lineup/check`: Triggers an on-demand lineup check.
- `POST /waivers/run`: Triggers an on-demand waiver run.
- `GET /approvals/pending`: Lists all recommendations awaiting manual approval.
- `POST /approvals/approve`: Approves and executes a staged recommendation.
- `POST /approvals/reject`: Rejects a staged recommendation.
- `GET /oauth/start`: Initiates the Yahoo OAuth flow.
- `GET /oauth/callback`: Handles the OAuth callback from Yahoo.

## 6. Success Metrics (MVP)

## 7. Memory & Weekly Goals

- The agent maintains short-term memory using the Historian and Recall tools.
- Weekly cycle:
  - Generate and persist a concise weekly goal (`kind=weekly_goal`) and 3–5 todos (`kind=todo`).
  - Each week, assess progress against the stored goal/todos and refine the plan.
- Historian stores structured entries; Recall fetches recent `weekly_goal`, `todo`, and `report` signals to ground the agent’s planning.

- **Functionality:** All features listed in section 2 are implemented and functional.
- **Stability:** The daily job runs reliably without manual intervention.
- **Usability:** The Streamlit UI is clear and allows managers to easily review reports and approve/reject recommendations.
- **Performance:** The daily report generation completes within a reasonable timeframe (e.g., under 2 minutes).
