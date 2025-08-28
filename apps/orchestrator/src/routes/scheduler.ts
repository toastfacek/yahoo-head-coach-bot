import { Request, Response } from 'express';
import { DateTime } from 'luxon';

import { runHeadCoach } from '../agents/headCoach';

// Hourly cron target that gates execution to 22:00 ET (10 pm ET)
export async function hourly(req: Request, res: Response) {
  const nowET = DateTime.now().setZone('America/New_York');
  const hour = nowET.hour;

  const leagueId = String((req.query as any).leagueId || '');
  const userId = String((req.query as any).userId || 'dev');

  if (hour !== 22) {
    return res.json({ ran: false, reason: 'outside_window', hour, zone: 'America/New_York' });
  }

  if (!leagueId) {
    return res.json({ ran: false, reason: 'missing_leagueId', hour, zone: 'America/New_York' });
  }

  try {
    const startedAt = new Date().toISOString();
    const stream = await runHeadCoach({ leagueId, userId, intent: 'DAILY_REPORT' });
    const text = await (stream as any).text();
    return res.json({
      ran: true,
      startedAt,
      hour,
      zone: 'America/New_York',
      length: text?.length ?? 0,
    });
  } catch (error: any) {
    console.error('scheduler/hourly error:', error);
    return res
      .status(500)
      .json({ ran: false, error: 'agent_error', message: error?.message || 'Unknown error' });
  }
}
