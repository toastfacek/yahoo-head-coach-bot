import { Request, Response } from 'express';
import { z } from 'zod';
import { runHeadCoach } from '../agents/headCoach';

const Body = z.object({
  leagueId: z.string().min(1),
  userId: z.string().optional().default('dev'),
});

export async function checkLineup(req: Request, res: Response) {
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
  const { leagueId, userId } = parsed.data;
  try {
    const stream = await runHeadCoach({ leagueId, userId, intent: 'LINEUP_CHECK' });
    const text = await (stream as any).text();
    res.json({ text });
  } catch (error: any) {
    console.error('checkLineup error:', error);
    res.status(500).json({ error: 'Agent error', message: error?.message || 'Unknown error' });
  }
}
