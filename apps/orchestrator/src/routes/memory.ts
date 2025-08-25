import { Request, Response } from 'express';
import { runHeadCoach } from '../agents/headCoach';

// Trigger a weekly summary/goal planning run (non-streaming)
export async function weeklySummary(req: Request, res: Response) {
  const leagueId = String((req.query as any).leagueId || '');
  const userId = String((req.query as any).userId || 'dev');
  if (!leagueId) return res.status(400).json({ error: 'leagueId is required' });
  try {
    const run = await runHeadCoach({ leagueId, userId, intent: 'WEEKLY_SUMMARY' });
    const text = await (run as any).text();
    return res.json({ text });
  } catch (err:any) {
    console.error('weeklySummary error:', err);
    return res.status(500).json({ error: 'Agent error', message: err?.message || 'Unknown error' });
  }
}

