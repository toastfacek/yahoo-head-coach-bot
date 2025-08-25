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

  try {
    return streamText({
      model,
      system,
      messages: [{ role: 'user', content: `Run ${intent} for league ${leagueId}.` }],
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
