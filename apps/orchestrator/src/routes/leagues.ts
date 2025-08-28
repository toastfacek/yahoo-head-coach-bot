import { Request, Response } from 'express';
import { z } from 'zod';

import { listUserLeagues } from '../services/yahoo';

const Query = z.object({ userId: z.string().min(1) });

export async function getUserLeagues(req: Request, res: Response) {
  const parsed = Query.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid query', details: parsed.error.flatten() });
    return;
  }

  const { userId } = parsed.data;
  try {
    const leagues = await listUserLeagues(userId, 'nfl');
    res.json({ leagues });
  } catch (error: any) {
    console.error('getUserLeagues error:', error);
    res
      .status(500)
      .json({ error: 'Failed to fetch leagues', message: error?.message || 'Unknown error' });
  }
}
