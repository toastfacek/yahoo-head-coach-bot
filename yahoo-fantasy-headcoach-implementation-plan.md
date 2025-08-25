# Yahoo Fantasy “HeadCoach” — Implementation Plan (Vercel AI SDK + Streamlit + Supabase)

This plan turns the PRD + your decisions into a concrete build you can hand to Claude Code. It uses:
- **Backend**: Node/TypeScript, **Vercel AI SDK** tool-calling, Express server (Railway/Render/Fly/Cloud Run)
- **LLM**: Anthropic via `@ai-sdk/anthropic`
- **DB**: Supabase Postgres with Prisma
- **Auth/Executor**: Yahoo via `yahoo-fantasy` (Node)
- **UI**: Streamlit (Python) consuming backend REST + SSE
- **Schedule**: Daily 10:00 pm ET (hourly cron + ET gate)

---

## 0) Repo Bootstrap

**Goal:** Monorepo with `apps/orchestrator` (Node) + `apps/ui` (Streamlit) + `packages/data` (Prisma client) + `packages/shared` (types/prompts).

**Tasks**
- Initialize npm workspaces.
- Create folder structure and baseline TS config.
- Add a root `.env.example` and per-app `.env.example`.

**Commands**
```bash
npm init -y
npm i -D typescript ts-node nodemon dotenv
```

**Workspace structure**
```
yahoo-fantasy-agent/
  apps/
    orchestrator/
    ui/
  packages/
    data/
    shared/
```

---

## 1) Data Layer (Supabase + Prisma)

**Goal:** Persist Yahoo tokens, league/team snapshots, signals, recommendations, decisions, costs.

**Tasks**
1. Add Prisma + client and generate schema.
2. Configure `DATABASE_URL` for Supabase.
3. Generate migrations & client.

**Install**
```bash
npm i -w packages/data prisma @prisma/client
npx -w packages/data prisma init
```

**File:** `packages/data/prisma/schema.prisma`
```prisma
datasource db { provider = "postgresql"; url = env("DATABASE_URL") }
generator client { provider = "prisma-client-js" }

model User {
  id         String      @id @default(cuid())
  email      String?     @unique
  yahooToken YahooToken?
  leagues    LeagueUser[]
  createdAt  DateTime    @default(now())
}

model YahooToken {
  userId       String   @id
  accessToken  String
  refreshToken String
  expiresAt    DateTime
  tokenType    String
  scope        String?
  user         User     @relation(fields: [userId], references: [id])
  updatedAt    DateTime @updatedAt
}

model League {
  id         String   @id
  name       String
  sport      String
  season     Int
  teams      Team[]
  members    LeagueUser[]
  snapshots  LeagueSnapshot[]
}

model LeagueUser {
  id       String @id @default(cuid())
  leagueId String
  userId   String
  role     String
  league   League @relation(fields: [leagueId], references: [id])
  user     User   @relation(fields: [userId], references: [id])
  @@unique([leagueId, userId])
}

model Team {
  id           String @id
  leagueId     String
  name         String
  fabRemaining Int
  rosterJson   Json
  league       League @relation(fields:[leagueId], references:[id])
}

model Signal {
  id       String   @id @default(cuid())
  leagueId String
  kind     String   // injury | news | sentiment | vegas | weather
  payload  Json
  asOf     DateTime @default(now())
  source   String
}

model Recommendation {
  id           String   @id @default(cuid())
  leagueId     String
  type         String   // LINEUP_SWAP | WAIVER
  summary      String
  payload      Json
  confidence   Float
  fabBid       Int?
  autoEligible Boolean  @default(false)
  status       String   @default("STAGED") // STAGED|EXECUTED|REJECTED
  createdAt    DateTime @default(now())
}

model Decision {
  id                String   @id @default(cuid())
  recommendationId  String
  action            String   // APPROVE|REJECT|AUTO_EXECUTE
  actorUserId       String?
  executedAt        DateTime?
  result            Json?
}

model LeagueSnapshot {
  id         String   @id @default(cuid())
  leagueId   String
  week       Int
  rosterJson Json
  createdAt  DateTime @default(now())
}

model CostLog {
  id               String   @id @default(cuid())
  model            String
  promptTokens     Int
  completionTokens Int
  costUsd          Float
  context          String?
  createdAt        DateTime @default(now())
}
```

**Generate**
```bash
npx -w packages/data prisma migrate dev --name init
npx -w packages/data prisma generate
```

**File:** `packages/data/src/db.ts`
```ts
import { PrismaClient } from '@prisma/client';
export const db = new PrismaClient();
```

---

## 2) Backend Orchestrator (Express + Vercel AI SDK)

**Goal:** Express server with AI SDK “HeadCoach” agent and tools: `scout`, `analyst`, `executor`, `historian`.

**Install**
```bash
cd apps/orchestrator
npm i express cors zod ai @ai-sdk/anthropic luxon yahoo-fantasy
npm i -D ts-node typescript @types/express @types/cors
```

**File:** `apps/orchestrator/src/config/policy.ts`
```ts
export const POLICY = {
  confidence: { execute: 0.80, stageMin: 0.60 },
  fab: { autoExecuteBudgetPct: 0.03 }, // 3% of remaining FAB
  autoSwapInjuryOut: true,
  approvals: { requireAboveAutoRules: true },
};
```

**File:** `apps/orchestrator/src/guards/shouldExecute.ts`
```ts
import { POLICY } from '../config/policy';
export function shouldAutoExecute(rec: {
  type: 'WAIVER'|'LINEUP_SWAP';
  confidence: number;
  isInjuryOut?: boolean;
  fabBid?: number;
  fabRemaining?: number;
}) {
  if (rec.confidence < POLICY.confidence.execute) return false;
  if (rec.type === 'LINEUP_SWAP' && rec.isInjuryOut && POLICY.autoSwapInjuryOut) return true;
  if (rec.type === 'WAIVER' && rec.fabBid != null && rec.fabRemaining != null) {
    const pct = rec.fabBid / Math.max(rec.fabRemaining, 1);
    if (pct <= POLICY.fab.autoExecuteBudgetPct) return true;
  }
  return false;
}
```

**Yahoo service**

**File:** `apps/orchestrator/src/services/yahoo.ts`
```ts
import YahooFantasy from 'yahoo-fantasy';
import { db } from '@data/db';

export async function yfForUser(userId: string) {
  const tok = await db.yahooToken.findUnique({ where: { userId } });
  if (!tok) throw new Error('Missing Yahoo token');
  const yf = new YahooFantasy({
    key: process.env.YAHOO_CLIENT_ID!,
    secret: process.env.YAHOO_CLIENT_SECRET!,
    redirectUri: process.env.YAHOO_REDIRECT_URI!,
  });
  // TODO: hydrate oauth tokens on yf instance (depends on lib method)
  return yf;
}
```

**Scout placeholders**

**Files:** `apps/orchestrator/src/services/scout/*.ts`
```ts
// athletic.ts
export async function fromAthletic(playerIds:string[]) { /* TODO: respect ToS; store URL + timestamp */ return []; }
// rotoballer.ts
export async function fromRotoballer(playerIds:string[]) { return []; }
// reddit.ts
export async function fromReddit(subreddits:string[]) { return []; }
// xlist.ts
export async function fromXList(listId:string) { return []; }
// vegas.ts
export async function fromVegas(matchups:string[]) { return []; }
// weather.ts (Open-Meteo suggested)
export async function fromWeather(stadium:{lat:number;lon:number;time:string}) { return []; }
```

**Tools**

**File:** `apps/orchestrator/src/tools/scout.ts`
```ts
export async function scout({ leagueId }:{ leagueId: string }) {
  // TODO: derive playerIds & matchups from league context
  return {
    injuries: [], news: [], sentiment: [], vegas: [], weather: [],
    asOf: new Date().toISOString()
  };
}
```

**File:** `apps/orchestrator/src/tools/analyst.ts`
```ts
export async function analyze({ leagueId, window = 'DAILY' }:{
  leagueId: string; window?: 'WEEK'|'DAILY'|'SUNDAY_FINAL';
}) {
  // TODO: rules + projections + conflicts → normalized actions
  return {
    lineup: [], // e.g., [{ type:'LINEUP_SWAP', summary:'Start X over Y', confidence:0.82, reason:'INJURY_OUT' }]
    waivers: [] // e.g., [{ type:'WAIVER', summary:'Add X for Y', fabBid:12, fabRemaining:400, confidence:0.87 }]
  };
}
```

**File:** `apps/orchestrator/src/tools/executor.ts`
```ts
import { shouldAutoExecute } from '../guards/shouldExecute';
import { db } from '@data/db';
import { yfForUser } from '../services/yahoo';

export async function proposeOrExecute({ leagueId, userId, actions }:{
  leagueId: string; userId: string; actions: any[];
}) {
  const results = [];
  for (const a of actions) {
    const auto = shouldAutoExecute({
      type: a.type, confidence: a.confidence,
      isInjuryOut: a.reason === 'INJURY_OUT',
      fabBid: a.fabBid ?? null, fabRemaining: a.fabRemaining ?? null,
    });
    if (auto) {
      const yf = await yfForUser(userId);
      // TODO: call Yahoo mutation
      results.push({ id: a.id, status: 'EXECUTED', auto: true });
    } else {
      await db.recommendation.create({
        data: {
          leagueId, type: a.type, summary: a.summary,
          payload: a, confidence: a.confidence,
          fabBid: a.fabBid ?? null, autoEligible: false, status:'STAGED'
        }
      });
      results.push({ id: a.id, status: 'STAGED', auto: false });
    }
  }
  return { results };
}
```

**File:** `apps/orchestrator/src/tools/historian.ts`
```ts
import { db } from '@data/db';
export async function record({ leagueId, payload }:{ leagueId:string; payload:any }) {
  // persist signals, recommendations, decisions as needed
  return db.signal.create({ data: { leagueId, kind:'meta', payload, source:'headcoach' }});
}
```

**HeadCoach agent (Vercel AI SDK)**

**File:** `apps/orchestrator/src/agents/headCoach.ts`
```ts
import { streamText, tool } from 'ai';
import { model } from '../ai';
import { z } from 'zod';
import { scout } from '../tools/scout';
import { analyze } from '../tools/analyst';
import { proposeOrExecute } from '../tools/executor';
import { record } from '../tools/historian';

export async function runHeadCoach({ leagueId, userId, intent }:{
  leagueId: string; userId: string;
  intent: 'DAILY_REPORT'|'WEEKLY_WAIVERS'|'LINEUP_CHECK'|'ON_DEMAND';
}) {
  const system = `You are HeadCoach. Optimize playoff odds. Respect approvals. Explain succinctly.`;
  return streamText({
    model,
    system,
    messages: [{ role: 'user', content: `Run ${intent} for league ${leagueId}.` }],
    tools: {
      scout: tool({ description:'Collect signals',
        inputSchema: z.object({ leagueId:z.string() }),
        execute: ({ leagueId }) => scout({ leagueId }) }),
      analyst: tool({ description:'Analyze into actions',
        inputSchema: z.object({ leagueId:z.string(), window: z.string().optional() }),
        execute: (i) => analyze(i) }),
      executor: tool({ description:'Stage/Execute with policy',
        inputSchema: z.object({ leagueId:z.string(), userId:z.string(), actions: z.array(z.any()) }),
        execute: (i) => proposeOrExecute(i) }),
      historian: tool({ description:'Persist audit trail',
        inputSchema: z.object({ leagueId:z.string(), payload:z.any() }),
        execute: (i) => record(i) }),
    }
  });
}
```

**Express app + routes**

**File:** `apps/orchestrator/src/routes/reports.ts`
```ts
import { Request, Response } from 'express';
import { runHeadCoach } from '../agents/headCoach';

export async function dailyReport(req: Request, res: Response) {
  res.writeHead(200, {'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});
  const { leagueId, userId } = req.query as any;
  const stream = await runHeadCoach({ leagueId, userId, intent: 'DAILY_REPORT' });
  for await (const chunk of stream.textStream) res.write(`data: ${chunk}\n\n`);
  res.write('event: done\ndata: {}\n\n'); res.end();
}
```

**File:** `apps/orchestrator/src/routes/lineup.ts`
```ts
import { Request, Response } from 'express';
import { runHeadCoach } from '../agents/headCoach';
export async function checkLineup(req: Request, res: Response) {
  const { leagueId, userId } = req.body;
  const stream = await runHeadCoach({ leagueId, userId, intent:'LINEUP_CHECK' });
  const text = await stream.text(); // non-SSE path
  res.json({ text });
}
```

**File:** `apps/orchestrator/src/routes/waivers.ts`
```ts
import { Request, Response } from 'express';
import { runHeadCoach } from '../agents/headCoach';
export async function runWaivers(req: Request, res: Response) {
  const { leagueId, userId } = req.body;
  const stream = await runHeadCoach({ leagueId, userId, intent:'WEEKLY_WAIVERS' });
  const text = await stream.text();
  res.json({ text });
}
```

**Approvals (stage → execute)**

**File:** `apps/orchestrator/src/routes/approvals.ts`
```ts
import { Request, Response } from 'express';
import { db } from '@data/db';
import { yfForUser } from '../services/yahoo';

export async function listPending(req: Request, res: Response) {
  const { leagueId } = req.query as any;
  const pending = await db.recommendation.findMany({ where: { leagueId, status: 'STAGED' }});
  res.json({ pending });
}

export async function approve(req: Request, res: Response) {
  const { id, userId } = req.body;
  const rec = await db.recommendation.findUnique({ where: { id }});
  if (!rec) return res.status(404).json({ error:'not found' });
  const yf = await yfForUser(userId);
  // TODO: execute rec.payload via Yahoo
  await db.recommendation.update({ where:{ id }, data:{ status:'EXECUTED' }});
  res.json({ ok:true });
}

export async function reject(req: Request, res: Response) {
  const { id } = req.body;
  await db.recommendation.update({ where:{ id }, data:{ status:'REJECTED' }});
  res.json({ ok:true });
}
```

**Server entry**

**File:** `apps/orchestrator/src/index.ts`
```ts
import express from 'express';
import cors from 'cors';
import { dailyReport } from './routes/reports';
import { checkLineup } from './routes/lineup';
import { runWaivers } from './routes/waivers';
import { listPending, approve, reject } from './routes/approvals';

const app = express();
app.use(cors()); app.use(express.json());

app.get('/reports/daily', dailyReport);
app.post('/lineup/check', checkLineup);
app.post('/waivers/run', runWaivers);
app.get('/approvals/pending', listPending);
app.post('/approvals/approve', approve);
app.post('/approvals/reject', reject);

// TODO: /oauth/start, /oauth/callback for Yahoo 3-legged
app.listen(process.env.PORT || 8787, () => console.log('Orchestrator up'));
```

---

## 3) Yahoo OAuth (3-legged)

**Goal:** Store tokens in `YahooToken`. Must add:
- `GET /oauth/start` → redirect to Yahoo
- `GET /oauth/callback` → exchange code; persist tokens for `userId`

**Tasks**
- Implement token exchange/refresh.
- Persist `accessToken`, `refreshToken`, `expiresAt`.
- Tie to your app’s `userId` (for dev, use a static userId or local session).

---

## 4) Streamlit UI

**Goal:** Keep your existing `app.py`, link to backend, add optional policy sliders.

**File:** `apps/ui/app.py` (ensure `API_BASE` points to orchestrator)
- Buttons: Run Daily Report (SSE), Check Lineup, Run Waivers
- Approvals: list + Approve/Reject endpoints
- (Optional) Sliders to post policy values if you want runtime overrides

---

## 5) Scheduler (Daily 10:00 pm ET)

**Goal:** Ensure run at 22:00 America/New_York, DST-safe.

**Option A (recommended for now):** External cron hits `/scheduler/hourly` every hour; server gates using Luxon.

**Files**
- `apps/orchestrator/src/routes/scheduler.ts` — returns `{ ran: true|false }` based on ET gate
- Add your platform’s hourly cron (Railway/Render/Fly/Cloud Run)

```ts
import { DateTime } from 'luxon';
import { Request, Response } from 'express';
import { runHeadCoach } from '../agents/headCoach';

export async function hourly(req: Request, res: Response) {
  const nowNY = DateTime.now().setZone('America/New_York');
  if (nowNY.hour === 22) {
    // TODO: enumerate leagues/users → run HeadCoach DAILY_REPORT
    // await runHeadCoach({ leagueId, userId, intent:'DAILY_REPORT' });
    return res.json({ ran: true, hour: nowNY.toISO() });
  }
  res.json({ ran:false, hour: nowNY.toISO() });
}
```

---

## 6) Env & Secrets

**File:** `.env.example`
```
# Anthropic
ANTHROPIC_API_KEY=

# Yahoo OAuth
YAHOO_CLIENT_ID=
YAHOO_CLIENT_SECRET=
YAHOO_REDIRECT_URI=http://localhost:8787/oauth/callback

# Supabase
DATABASE_URL=postgresql://...
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# Scout (optional placeholders)
REDDIT_CLIENT_ID=
REDDIT_CLIENT_SECRET=
REDDIT_USER_AGENT=FantasyHeadCoach/1.0
X_BEARER_TOKEN=
ODDS_API_KEY=
```

---

## 7) Action Spec (normalized payload)

**Use this shape from Analyst → Executor**
```ts
type Action =
  | { id:string; type:'LINEUP_SWAP';
      summary:string; confidence:number;
      fromPlayerId:string; toPlayerId:string;
      slot:string; reason?:'INJURY_OUT'|'PROJECTION_EDGE'|'BYE'; }
  | { id:string; type:'WAIVER';
      summary:string; confidence:number;
      addPlayerId:string; dropPlayerId?:string;
      fabBid:number; fabRemaining:number; reason?:string; };
```

---

## 8) API Contract (for UI & tests)

- `GET /reports/daily?leagueId&userId` → **SSE stream** of markdown report
- `POST /lineup/check { leagueId, userId }` → `{ text }`
- `POST /waivers/run { leagueId, userId }` → `{ text }`
- `GET /approvals/pending?leagueId` → `{ pending: Recommendation[] }`
- `POST /approvals/approve { id, userId }` → `{ ok:true }`
- `POST /approvals/reject { id }` → `{ ok:true }`
- `GET /scheduler/hourly` → `{ ran:boolean, hour:string }`
- `GET /oauth/start` → 302 redirect
- `GET /oauth/callback?code` → sets tokens; redirects to UI

**Smoke test (curl)**
```bash
curl -N "http://localhost:8787/reports/daily?leagueId=123&userId=dev"
curl -XPOST "http://localhost:8787/lineup/check" -H "content-type: application/json" -d '{"leagueId":"123","userId":"dev"}'
curl "http://localhost:8787/approvals/pending?leagueId=123"
```

---

## 9) Testing & Quality

**Unit**
- `shouldAutoExecute` cases:
  - Injury OUT + conf 0.80 → true
  - Waiver with 3% threshold (edge: exactly 0.03) → true
  - Conf 0.79 → false

**Integration**
- Mock Yahoo service; ensure `approve` flips STAGED → EXECUTED.
- SSE endpoint streams non-empty data for a trivial prompt.

**E2E (manual)**
- OAuth sign-in → daily report → staged waiver → approve → status EXECUTED.

---

## 10) Observability & Cost

- Add middleware to log token usage (if available per-provider) into `CostLog`.
- Request IDs and correlation IDs in logs.
- Minimal redaction for PII in logs.

---

## 11) Deployment

- **Orchestrator**: Railway/Render/Fly/Cloud Run (long-lived server good for SSE + OAuth redirects)
- **Streamlit**: Streamlit Cloud or Fly/Railway
- **Supabase**: Hosted
- **Cron**: Platform hourly cron → `GET /scheduler/hourly`

---

## 12) Acceptance Criteria (Milestone-driven)

**M1 – Data & Server Skeleton**
- Prisma schema migrated, `db` client usable.
- Express server runs locally (`:8787`), health check OK.

**M2 – OAuth**
- `/oauth/start` and `/oauth/callback` persist Yahoo tokens for `userId=dev`.

**M3 – Agent & Tools**
- `runHeadCoach` streams dummy text via SSE.
- `scout/analyst/executor/historian` stubbed; executor stages actions in DB.

**M4 – Approvals**
- `/approvals/pending` lists staged items.
- `/approvals/approve|reject` updates status; approve path calls Yahoo mock.

**M5 – Streamlit**
- Buttons call backend; daily report renders streaming text; approvals work.

**M6 – Scheduler**
- Hourly cron + ET gate triggers the daily report once per day.

**M7 – Policy**
- Injury OUT swaps auto-exec.
- Waivers auto-exec when `fabBid / fabRemaining ≤ 0.03`.
- Confidence execution cutoff 0.80 respected.

---

## 13) Nice-to-haves (Post-MVP)

- Policy knobs in Streamlit (FAB %, confidence).
- Per-league/user policy overrides.
- Cache Scout outputs per day to reduce cost.
- Add projections provider(s) & start/sit rules.
- Multi-model routing (keep Anthropic default).

---

### What Claude Code should do first
1. Create folders/files above and paste the code stubs.
2. Wire Prisma + migrate.
3. Bring up Express server + SSE route.
4. Run Streamlit UI against local server and verify streaming.
5. Add Yahoo OAuth endpoints and persist tokens.
6. Implement `shouldAutoExecute` tests.
7. Add hourly scheduler route and run manual trigger.
