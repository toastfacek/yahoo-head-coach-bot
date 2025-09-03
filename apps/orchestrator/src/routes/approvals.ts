import { Request, Response } from 'express';
import { z } from 'zod';

import { prisma } from '../db';
import {
  yfForUser,
  createYahooClient,
  getGameKey,
  leagueKeyFor,
  userTeamKey,
  callYahoo,
} from '../services/yahoo';

export async function listPending(req: Request, res: Response): Promise<void> {
  const Query = z.object({ leagueId: z.string().min(1) });
  const parsed = Query.safeParse(req.query);
  if (!parsed.success)
    return void res.status(400).json({ error: 'Invalid query', details: parsed.error.flatten() });
  const { leagueId } = parsed.data;
  const recs = await prisma.recommendation.findMany({
    where: { leagueId, status: 'STAGED' },
    orderBy: { createdAt: 'desc' },
  });
  // Normalize for Discord bot expectations
  const pending = recs.map((r) => ({
    id: r.id,
    type: r.type === 'WAIVER' ? 'WAIVER_CLAIM' : r.type,
    summary: r.summary,
    confidence: r.confidence,
    reason: (r as any).reason || undefined,
    notes: undefined,
    data: (r as any).payload,
    created_at: r.createdAt,
  }));
  return void res.json({ pending });
}

const ApproveBody = z.object({
  id: z.string().min(1),
  userId: z.string().optional().default('dev'),
});

export async function approve(req: Request, res: Response): Promise<void> {
  const parsed = ApproveBody.safeParse(req.body);
  if (!parsed.success)
    return void res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });

  const { id, userId: rawUserId } = parsed.data;
  // Map Discord ID to internal userId if applicable
  const map = await prisma.discordUser.findUnique({ where: { discordId: rawUserId } });
  const userId = map?.userId || rawUserId;
  const rec = await prisma.recommendation.findUnique({ where: { id } });
  if (!rec) return void res.status(404).json({ error: 'Not found' });

  if (rec.status !== 'STAGED') {
    return void res.status(400).json({ error: 'Recommendation is not staged for approval' });
  }

  try {
    // Build both the direct client (for helpers) and the wrapper (for execution)
    const direct = await createYahooClient(userId);
    const yf = await yfForUser(userId);
    const gameKey = await getGameKey(direct, 'nfl');
    const leagueKey = leagueKeyFor(gameKey, rec.leagueId);
    const teamKey = await userTeamKey(direct, gameKey, leagueKey);

    if (!teamKey) {
      return void res.status(400).json({ error: 'Could not find team key for user in league' });
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
      return void res.json({ success: true, ok: true, result: execRes });
    } else {
      // Update with execution failure details
      await prisma.recommendation.update({
        where: { id },
        data: {
          executionResult: execRes,
        },
      });
      const badRequestReasons = new Set([
        'MISSING_ADD_PLAYER_ID',
        'MISSING_PLAYER_MOVES',
        'MISSING_REQUIRED_PARAMS',
      ]);
      const reason = execRes?.reason ?? '';
      const statusCode = badRequestReasons.has(reason) ? 400 : 500;
      return void res.status(statusCode).json({
        success: false,
        error: 'Yahoo API execution failed',
        reason: execRes?.reason,
        details: execRes,
      });
    }
  } catch (error: any) {
    console.error('Approval execution error:', error);
    return void res
      .status(500)
      .json({ success: false, error: 'Execution error', message: error.message });
  }
}

const RejectBody = z.object({ id: z.string().min(1) });

export async function reject(req: Request, res: Response): Promise<void> {
  const parsed = RejectBody.safeParse(req.body);
  if (!parsed.success)
    return void res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
  const { id } = parsed.data;
  await prisma.recommendation.update({ where: { id }, data: { status: 'REJECTED' } });
  return void res.json({ success: true, ok: true });
}
