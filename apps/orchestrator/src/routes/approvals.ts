import { Request, Response } from 'express';
import { z } from 'zod';

import { prisma } from '../db';
import { yfForUser, getGameKey, leagueKeyFor, userTeamKey, callYahoo } from '../services/yahoo';

export async function listPending(req: Request, res: Response) {
  const Query = z.object({ leagueId: z.string().min(1) });
  const parsed = Query.safeParse(req.query);
  if (!parsed.success)
    return res.status(400).json({ error: 'Invalid query', details: parsed.error.flatten() });
  const { leagueId } = parsed.data;
  const pending = await prisma.recommendation.findMany({
    where: { leagueId, status: 'STAGED' },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ pending });
}

const ApproveBody = z.object({
  id: z.string().min(1),
  userId: z.string().optional().default('dev'),
});

export async function approve(req: Request, res: Response) {
  const parsed = ApproveBody.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });

  const { id, userId } = parsed.data;
  const rec = await prisma.recommendation.findUnique({ where: { id } });
  if (!rec) return res.status(404).json({ error: 'Not found' });

  if (rec.status !== 'STAGED') {
    return res.status(400).json({ error: 'Recommendation is not staged for approval' });
  }

  try {
    // Execute the action via Yahoo API
    const yf = await yfForUser(userId);
    const gameKey = await getGameKey(yf, 'nfl');
    const leagueKey = leagueKeyFor(gameKey, rec.leagueId);
    const teamKey = await userTeamKey(yf, gameKey, leagueKey);

    if (!teamKey) {
      return res.status(400).json({ error: 'Could not find team key for user in league' });
    }

    const execRes = await callYahoo({
      leagueKey,
      teamKey,
      action: rec.payload,
      yf,
    });

    if (execRes?.success) {
      await prisma.recommendation.update({
        where: { id },
        data: {
          status: 'EXECUTED',
          executedAt: new Date(),
          executionResult: execRes,
        },
      });
      res.json({ ok: true, result: execRes });
    } else {
      // Update with execution failure details
      await prisma.recommendation.update({
        where: { id },
        data: {
          executionResult: execRes,
        },
      });
      res.status(500).json({
        error: 'Yahoo API execution failed',
        reason: execRes?.reason,
        details: execRes,
      });
    }
  } catch (error: any) {
    console.error('Approval execution error:', error);
    res.status(500).json({
      error: 'Execution error',
      message: error.message,
    });
  }
}

const RejectBody = z.object({ id: z.string().min(1) });

export async function reject(req: Request, res: Response) {
  const parsed = RejectBody.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
  const { id } = parsed.data;
  await prisma.recommendation.update({ where: { id }, data: { status: 'REJECTED' } });
  res.json({ ok: true });
}
