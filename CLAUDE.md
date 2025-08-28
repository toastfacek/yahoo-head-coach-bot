# CLAUDE.md

This file provides guidance when working with code in this repository.

## Project Overview

Yahoo Fantasy "HeadCoach" is an AI-powered fantasy football management assistant that automates team optimization decisions. It provides daily reports, waiver wire recommendations, and lineup suggestions using a policy-driven approach with confidence thresholds for automated execution vs manual approval.

## Architecture

**Monorepo Structure:**
- `apps/orchestrator/` - Node.js/Express backend with TypeScript
- `apps/discord-bot/` - Discord bot client with TypeScript
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

**Discord Bot:**
```bash
npm run dev:discord     # Start Discord bot in development
npm run deploy-commands # Deploy Discord slash commands
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

## OAuth Development Troubleshooting

### Complete Authentication Flow Issues (Fixed Session)

**Problem**: TypeScript compilation memory errors prevented normal development server startup, and Yahoo OAuth authentication wasn't working properly in the Streamlit UI.

**Root Cause Analysis:**
1. **Memory Issues**: `npm run dev` crashed with heap out of memory errors due to large codebase TypeScript compilation
2. **Authentication Modal Blocking**: Modal interface prevented user interaction with auth flow
3. **API Endpoint Mismatches**: Streamlit expected different endpoint names than server provided
4. **Yahoo API Data Structure**: Complex nested array format not parsed correctly
5. **Missing Data Fields**: Streamlit UI expected `points` field that wasn't provided

**Solution: Quick Development Server**
Created minimal OAuth server (`apps/orchestrator/simple-server.js`) that bypasses TypeScript compilation:

```javascript
// Complete OAuth flow with token storage
app.get('/api/oauth/start', (req, res) => { /* Yahoo OAuth redirect */ });
app.get('/api/oauth/callback', async (req, res) => { /* Token exchange */ });
app.get('/api/oauth/status', (req, res) => { /* Check auth status */ });

// Yahoo Fantasy API integration  
app.get('/api/leagues', async (req, res) => { /* Fetch user leagues */ });
app.get('/api/team/stats', async (req, res) => { /* Fetch league standings */ });
app.get('/api/team/roster', async (req, res) => { /* Fetch user roster */ });
```

**Yahoo API Data Structure Discoveries:**
- **Game Keys**: Must use `nfl.l.{leagueId}` not just `{leagueId}` 
- **Teams**: Nested arrays `teamData.team[0]` where each array element is a single-key object
- **Team Ownership**: `is_owned_by_current_login: 1` (number, not string)
- **Players**: Triple nested structure:
  ```javascript
  playerData.player[0] = [/* array of info objects */]
  playerData.player[1] = { selected_position: [/* position objects */] }
  ```

**Endpoint Format Requirements:**
- Teams: `GET /api/team/stats?userId=X&leagueId=Y` → `{ teams: [...] }`
- Roster: `GET /api/team/roster?userId=X&leagueId=Y` → `{ starters: [...], players: [...] }`  
- Leagues: `GET /api/leagues?userId=X` → `{ leagues: [{ id, name }] }`
- All player objects must include `points` field (even if 0) to prevent Streamlit KeyError

**Authentication Flow Fixes:**
1. **Removed blocking modal** - replaced with direct auth links
2. **Fixed endpoint naming** - matched Streamlit expectations exactly  
3. **Corrected Yahoo API calls** - used proper game key format
4. **Enhanced data parsing** - handled complex nested Yahoo response structure
5. **Added missing fields** - included `points: 0` to prevent UI crashes

**Ngrok Development Workflow:**
```bash
# Start ngrok tunnel
ngrok http 3000

# Update 3 locations with new URL:
# 1. .env: YAHOO_REDIRECT_URI=https://abc123.ngrok-free.app/api/oauth/callback  
# 2. Yahoo Developer Console: Redirect URI setting
# 3. apps/ui/app.py: API_BASE constant

# Start simple server
node simple-server.js

# Start Streamlit UI  
streamlit run apps/ui/app.py
```

**Result**: Full end-to-end OAuth authentication with real Yahoo Fantasy data display in Streamlit dashboard.

## Important Files

- `ROADMAP.md` - Current development status and task tracking
- `prd.md` - Product requirements and technical specifications  
- `YAHOO_OAUTH_SETUP.md` - Yahoo Developer Network setup instructions
- `packages/data/README.md` - Database setup and schema information
