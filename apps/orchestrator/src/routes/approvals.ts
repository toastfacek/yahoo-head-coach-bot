import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db';

export async function listPending(req: Request, res: Response) {
  const Query = z.object({ leagueId: z.string().min(1) });
  const parsed = Query.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid query', details: parsed.error.flatten() });
  const { leagueId } = parsed.data;
  const pending = await prisma.recommendation.findMany({ where: { leagueId, status: 'STAGED' }, orderBy: { createdAt: 'desc' } });
  res.json({ pending });
}

const ApproveBody = z.object({ id: z.string().min(1), userId: z.string().optional().default('dev') });

export async function approve(req: Request, res: Response) {
  const parsed = ApproveBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
  const { id } = parsed.data;
  const rec = await prisma.recommendation.findUnique({ where: { id } });
  if (!rec) return res.status(404).json({ error: 'Not found' });
  await prisma.recommendation.update({ where: { id }, data: { status: 'EXECUTED' } });
  res.json({ ok: true });
}

const RejectBody = z.object({ id: z.string().min(1) });

export async function reject(req: Request, res: Response) {
  const parsed = RejectBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
  const { id } = parsed.data;
  await prisma.recommendation.update({ where: { id }, data: { status: 'REJECTED' } });
  res.json({ ok: true });
}
