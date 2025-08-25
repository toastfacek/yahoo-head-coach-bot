# CLAUDE.md

This file provides guidance when working with code in this repository.

## Project Overview

Yahoo Fantasy "HeadCoach" is an AI-powered fantasy football management assistant that automates team optimization decisions. It provides daily reports, waiver wire recommendations, and lineup suggestions using a policy-driven approach with confidence thresholds for automated execution vs manual approval.

## Architecture

**Monorepo Structure:**
- `apps/orchestrator/` - Node.js/Express backend with TypeScript
- `apps/ui/` - Streamlit frontend in Python  
- `packages/data/` - Shared Prisma database schema and client

**Core AI Agent Pattern (Vercel AI SDK):**
The system uses a tool-based AI agent (`src/agents/headCoach.ts`) that coordinates four specialized tools:
- `scout` - Data collection (injuries, news, signals)
- `analyst` - Analysis and recommendation generation with confidence scoring  
- `executor` - Policy-driven execution or staging of recommendations
- `historian` - Persistence and audit logging

The agent uses the Vercel AI SDK (`ai`) with the Anthropic provider (`@ai-sdk/anthropic`). The model is configured centrally in `src/ai.ts` and can be overridden via the `AI_MODEL` env var.

**Policy-Driven Automation:**
Decisions are governed by `src/config/policy.ts` with configurable thresholds:
- Auto-execution: ≥80% confidence
- Manual staging: 60-79% confidence
- FAB limits: ≤3% of remaining budget for auto-execution

## Key Commands

**Backend (Orchestrator):**
```bash
# Development
npm run dev          # Start dev server with nodemon + ts-node
npm run build        # Compile TypeScript to dist/
npm start            # Run compiled production server

# Database
npx prisma migrate dev --name <name>   # Create and apply new migration
npx prisma generate                    # Regenerate Prisma client
npx prisma studio                      # Open database GUI
```

**Frontend (UI):**
```bash
streamlit run app.py    # Start Streamlit UI server
```

**Root workspace:**
```bash
npm install            # Install all dependencies in the monorepo
```

## Database Schema

**Core Tables:**
- `User` - User accounts with Yahoo OAuth tokens (1:1 with `YahooToken`)
- `League`/`LeagueUser`/`Team` - Fantasy league structure
- `Signal` - Raw data signals (injuries, news, etc.)
- `Recommendation` - AI-generated recommendations with confidence scores
- `Decision` - User approval/rejection decisions on recommendations

**Database Location:**
Supabase PostgreSQL (Project ID: awiyuoivkhemdkpoxniz, Region: us-east-2)

## Yahoo OAuth Integration

**OAuth Flow:**
- `/api/oauth/start` - Initiates Yahoo authorization with CSRF state protection
- `/api/oauth/callback` - Handles callback, exchanges code for tokens
- Tokens stored in `YahooToken` table with automatic refresh capability
- Requires `fspt-w` scope (Fantasy Sports Read/Write)

**Environment Variables Required:**
```
YAHOO_CLIENT_ID=<from Yahoo Developer Network>
YAHOO_CLIENT_SECRET=<from Yahoo Developer Network>  
YAHOO_REDIRECT_URI=http://localhost:3000/api/oauth/callback
DATABASE_URL=<Supabase connection string>
ANTHROPIC_API_KEY=<Anthropic API key>
AI_MODEL=claude-3-5-sonnet-20241022
```

## API Endpoints

**Core Agent Flow:**
- `GET /api/reports/daily` - Streams daily report via SSE
- `POST /lineup/check` - On-demand lineup analysis
- `POST /waivers/run` - On-demand waiver analysis

**Approval Workflow:**
- `GET /api/approvals/pending` - List staged recommendations
- `POST /api/approvals/approve` - Execute staged recommendation  
- `POST /api/approvals/reject` - Reject staged recommendation

## Development Workflow

**Current State (per ROADMAP.md):**
- Milestones 1-2 complete (foundation + OAuth)  
- Milestone 3 in progress (core agent tooling)
- Tools exist but are stubbed for Phase 3 implementation

**When Adding New Features:**
1. Agent tools should implement the established pattern with Zod schemas
2. Policy rules should be configurable in `policy.ts`
3. All recommendations must include confidence scores
4. Database changes require Prisma migrations
5. API responses should follow established patterns (structured JSON/SSE streams)

**Testing OAuth Flow:**
Visit `http://localhost:3000/api/oauth/start?userId=dev` to test Yahoo OAuth integration.

## Important Files

- `ROADMAP.md` - Current development status and task tracking
- `prd.md` - Product requirements and technical specifications  
- `YAHOO_OAUTH_SETUP.md` - Yahoo Developer Network setup instructions
- `packages/data/README.md` - Database setup and schema information
