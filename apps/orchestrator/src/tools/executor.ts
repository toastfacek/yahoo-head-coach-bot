import { prisma } from '../db';
import { shouldAutoExecute } from '../guards/shouldExecute';
import { POLICY } from '../config/policy';

type Action = {
  id?: string;
  type: 'WAIVER' | 'LINEUP_SWAP' | string;
  summary: string;
  confidence: number;
  fabBid?: number | null;
  fabRemaining?: number | null;
  reason?: string;
  [k: string]: any;
};

export async function proposeOrExecute({ leagueId, userId, actions }:{
  leagueId: string; userId: string; actions: Action[];
}) {
  const results: any[] = [];

  for (const a of actions || []) {
    // Below staging threshold → skip
    if (typeof a.confidence !== 'number' || a.confidence < POLICY.confidence.stageMin) {
      results.push({ id: a.id, status: 'SKIPPED_LOW_CONFIDENCE', autoEligible: false });
      continue;
    }

    const autoEligible = shouldAutoExecute({
      type: (a.type as any) === 'WAIVER' ? 'WAIVER' : 'LINEUP_SWAP',
      confidence: a.confidence,
      isInjuryOut: a.reason === 'INJURY_OUT' || a.isInjuryOut === true,
      fabBid: a.fabBid ?? null as any,
      fabRemaining: a.fabRemaining ?? null as any,
    });

    // Stage recommendation (MVP). Execution via Yahoo will be added later.
    const rec = await prisma.recommendation.create({
      data: {
        leagueId,
        type: String(a.type).toUpperCase(),
        summary: a.summary || `${a.type}`,
        payload: a as any,
        confidence: a.confidence,
        fabBid: a.fabBid ?? null,
        autoEligible,
        status: 'STAGED',
      },
    });

    results.push({ id: rec.id, status: 'STAGED', autoEligible });
  }

  return { results };
}
