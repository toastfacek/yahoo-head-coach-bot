// HeadCoach agent orchestration
// - Defines a compact, disciplined system prompt
// - Wires tool calling order: scout -> analyst -> executor -> historian
// - Streams text back to callers (SSE route uses textStream)
import { streamText, tool } from 'ai';
import { model } from '../ai';
import { POLICY } from '../config/policy';
import { env } from '../config/env';
import { z } from 'zod';
import { scout } from '../tools/scout';
import { analyze } from '../tools/analyst';
import { proposeOrExecute } from '../tools/executor';
import { record } from '../tools/historian';
import { recall } from '../tools/recall';

// Build the system prompt once per run with live policy/mode values
function buildSystem(): string {
  return [
    'You are HeadCoach — an assistant that helps optimize a Yahoo Fantasy Football team. ',
    'Operate with discipline: collect signals, analyze, propose actions, then (optionally) execute based on policy and execution mode. ',
    'Be concise, fact-based, and avoid speculation. If data is missing, state what is missing clearly.',
    '',
    // Make the tool order explicit to reduce model variance
    'Tool choreography (follow in this order):',
    '1) scout(leagueId) — collect roster/injury/news signals.',
    '2) analyst(leagueId, window) — transform signals into normalized actions with confidence.',
    '3) executor(leagueId, userId, actions) — stage/execute according to policy and execution mode.',
    '4) historian(leagueId, payload) — persist summary for audit.',
    '',
    // Surface server-side policy so model stays aligned with gates
    'Policy (authoritative):',
    `- Auto-execute when confidence >= ${POLICY.confidence.execute}.`,
    `- Stage when confidence in [${POLICY.confidence.stageMin}, ${POLICY.confidence.execute}).`,
    `- FAB auto-exec cap: <= ${Math.round(POLICY.fab.autoExecuteBudgetPct * 100)}% of remaining FAB.`,
    `- Auto-swap OUT injuries if alternative exists: ${POLICY.autoSwapInjuryOut ? 'enabled' : 'disabled'}.`,
    '',
    // Execution mode is enforced server-side; tell the model for consistent narration
    'Execution Mode (from server):',
    `- Mode=${env.EXECUTION_MODE} — live attempts execution for auto-eligible actions; stage/dry-run otherwise.`,
    '',
    // Keep outputs tidy for SSE/Streamlit
    'Output format (Markdown):',
    '### Summary — 2–4 bullets',
    '### Lineup — recommended swaps with reasons and confidence',
    '### Waivers — suggested adds/drops with FAB guidance',
    '### Notes — assumptions, missing data, next steps',
    '',
    'Example: Weekly Summary tool usage',
    '- recall({ leagueId, kinds:["weekly_goal","todo"], includeRecommendations:true, includeDecisions:true, limit:5 })',
    '- After forming a goal: historian({ leagueId, kind:"weekly_goal", payload:{ goal:"Win Week X matchup by optimizing RB efficiency" } })',
    '- For each todo: historian({ leagueId, kind:"todo", payload:{ item:"Start Player A over Player B in FLEX", status:"open" } })',
  ].join('\n');
}

export async function runHeadCoach({ leagueId, userId, intent }:{
  leagueId: string; userId: string;
  intent: 'DAILY_REPORT'|'WEEKLY_WAIVERS'|'LINEUP_CHECK'|'ON_DEMAND'|'WEEKLY_SUMMARY';
}) {
  // Compose the final system prompt with current policy + mode
  const system = buildSystem();

  try {
    // Kick off a streaming tool-call session
    return streamText({
      model,
      system,
      messages: [
        { role: 'user', content: buildUserInstruction({ intent, leagueId, userId }) }
      ],
      tools: {
        // Fetch recent memory (last reports/goals/todos) to inform planning and progress checks
        recall: tool({
          description: 'Recall recent memory and recommendations to ground planning and progress checks.',
          inputSchema: z.object({ leagueId: z.string(), kinds: z.array(z.string()).optional(), includeRecommendations: z.boolean().optional(), includeDecisions: z.boolean().optional(), limit: z.number().int().min(1).max(50).optional() }),
          execute: (i) => recall(i as any)
        }),
        // Collect signals (uses Yahoo reads)
        scout: tool({
          description: 'Collect signals (news/injuries/sentiment/vegas/weather).',
          inputSchema: z.object({ leagueId: z.string() }),
          execute: ({ leagueId }) => scout({ leagueId })
        }),
        // Turn signals into normalized actions with confidence
        analyst: tool({
          description: 'Turn signals + roster into lineup & waiver plans with confidence. Prefer passing prior scout() output as { scout } to avoid re-fetching.',
          inputSchema: z.object({
            leagueId: z.string(),
            window: z.string().optional(),
            scout: z.any().optional()
          }),
          execute: (i) => analyze(i)
        }),
        // Stage or execute per policy + EXECUTION_MODE (server-enforced)
        executor: tool({
          description: 'Stage or execute actions via Yahoo, applying policy guard.',
          inputSchema: z.object({ leagueId: z.string(), userId: z.string(), actions: z.array(z.any()) }),
          execute: (i) => proposeOrExecute(i)
        }),
        // Persist an audit trail of the run
        historian: tool({
          description: 'Persist recommendations/decisions for audit & learning.',
          inputSchema: z.object({ leagueId: z.string(), payload: z.any(), kind: z.string().optional() }),
          execute: (i) => record(i)
        })
      }
    });
  } catch (err) {
    console.error('HeadCoach agent error:', err);
    throw err;
  }
}

function buildUserInstruction({ intent, leagueId, userId }:{ intent:string; leagueId:string; userId:string }) {
  if (intent === 'WEEKLY_SUMMARY') {
    return [
      `Intent=${intent}; leagueId=${leagueId}; userId=${userId}.`,
      'Goals:',
      '- Recall last weekly goal and todos (if any).',
      '- Assess progress. Generate a clear weekly goal (one sentence).',
      '- Propose concrete todos for the coming week (3–5 items).',
      '- Use historian(kind="weekly_goal"|"todo") to persist goal/todos.',
      'Output: Summary, Goal, Todos, Notes (concise, Markdown).'
    ].join('\n');
  }

  return `Intent=${intent}; leagueId=${leagueId}; userId=${userId}. Produce a concise Markdown report and follow the tool choreography.`;
}
