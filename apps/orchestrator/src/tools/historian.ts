// Historian tool: persist and retrieve records for memory/audit
import { prisma } from '../db';

export async function getRecentSignals({ leagueId, kinds, limit = 5 }:{ leagueId:string; kinds?: string[]; limit?: number }) {
  const where:any = { leagueId };
  if (kinds && kinds.length) where.kind = { in: kinds } as any;
  const rows = await prisma.signal.findMany({ where, orderBy: { asOf: 'desc' }, take: Math.min(limit, 50) });
  return rows;
}

export async function getRecentRecommendations({ leagueId, status, limit = 5 }:{ leagueId:string; status?: string; limit?: number }) {
  const where:any = { leagueId };
  if (status) where.status = status;
  return prisma.recommendation.findMany({ where, orderBy: { createdAt: 'desc' }, take: Math.min(limit, 50) });
}

export async function getRecentDecisions({ leagueId, limit = 5 }:{ leagueId:string; limit?: number }) {
  // We don't have leagueId on Decision; join via Recommendation if needed in future.
  return prisma.decision.findMany({ orderBy: { executedAt: 'desc' }, take: Math.min(limit, 50) });
}

export async function record(input: { leagueId: string; payload: any; kind?: string }) {
  try {
    const { leagueId, payload } = input;
    const kind = input.kind || 'report';
    // Persist a generic 'report' signal so we can trace what was said/decided
    const entry = await prisma.signal.create({
      data: {
        leagueId,
        kind,
        payload: payload as any,
        source: 'headcoach',
      },
    });
    return { recorded: true, id: entry.id };
  } catch (err: any) {
    console.error('Historian error:', err);
    return { recorded: false, error: err?.message || 'record_failed' };
  }
}
