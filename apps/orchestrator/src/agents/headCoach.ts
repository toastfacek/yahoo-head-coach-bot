import { streamText, tool } from 'ai';
import { model } from '../ai';
import { POLICY } from '../config/policy';
import { env } from '../config/env';
import { z } from 'zod';
import { scout } from '../tools/scout';
import { analyze } from '../tools/analyst';
import { proposeOrExecute } from '../tools/executor';
import { record } from '../tools/historian';

function buildSystem(): string {
  return [
    'You are HeadCoach — an assistant that helps optimize a Yahoo Fantasy Football team. ',
    'Operate with discipline: collect signals, analyze, propose actions, then (optionally) execute based on policy and execution mode. ',
    'Be concise, fact-based, and avoid speculation. If data is missing, state what is missing clearly.',
    '',
    'Tool choreography (follow in this order):',
    '1) scout(leagueId) — collect roster/injury/news signals.',
    '2) analyst(leagueId, window) — transform signals into normalized actions with confidence.',
    '3) executor(leagueId, userId, actions) — stage/execute according to policy and execution mode.',
    '4) historian(leagueId, payload) — persist summary for audit.',
    '',
    'Policy (authoritative):',
    `- Auto-execute when confidence >= ${POLICY.confidence.execute}.`,
    `- Stage when confidence in [${POLICY.confidence.stageMin}, ${POLICY.confidence.execute}).`,
    `- FAB auto-exec cap: <= ${Math.round(POLICY.fab.autoExecuteBudgetPct * 100)}% of remaining FAB.`,
    `- Auto-swap OUT injuries if alternative exists: ${POLICY.autoSwapInjuryOut ? 'enabled' : 'disabled'}.`,
    '',
    'Execution Mode (from server):',
    `- Mode=${env.EXECUTION_MODE} — live attempts execution for auto-eligible actions; stage/dry-run otherwise.`,
    '',
    'Output format (Markdown):',
    '### Summary — 2–4 bullets',
    '### Lineup — recommended swaps with reasons and confidence',
    '### Waivers — suggested adds/drops with FAB guidance',
    '### Notes — assumptions, missing data, next steps',
  ].join('\n');
}

export async function runHeadCoach({ leagueId, userId, intent }:{
  leagueId: string; userId: string;
  intent: 'DAILY_REPORT'|'WEEKLY_WAIVERS'|'LINEUP_CHECK'|'ON_DEMAND';
}) {
  const system = buildSystem();

  try {
    return streamText({
      model,
      system,
      messages: [
        { role: 'user', content: `Intent=${intent}; leagueId=${leagueId}; userId=${userId}. Produce a concise Markdown report and follow the tool choreography.` }
      ],
      tools: {
        scout: tool({
          description: 'Collect signals (news/injuries/sentiment/vegas/weather).',
          inputSchema: z.object({ leagueId: z.string() }),
          execute: ({ leagueId }) => scout({ leagueId })
        }),
        analyst: tool({
          description: 'Turn signals + roster into lineup & waiver plans with confidence.',
          inputSchema: z.object({ leagueId: z.string(), window: z.string().optional() }),
          execute: (i) => analyze(i)
        }),
        executor: tool({
          description: 'Stage or execute actions via Yahoo, applying policy guard.',
          inputSchema: z.object({ leagueId: z.string(), userId: z.string(), actions: z.array(z.any()) }),
          execute: (i) => proposeOrExecute(i)
        }),
        historian: tool({
          description: 'Persist recommendations/decisions for audit & learning.',
          inputSchema: z.object({ leagueId: z.string(), payload: z.any() }),
          execute: (i) => record(i)
        })
      }
    });
  } catch (err) {
    console.error('HeadCoach agent error:', err);
    throw err;
  }
}
