// Executor tool: stage or execute actions depending on policy + EXECUTION_MODE
// Flow:
// - Below stageMin -> skip
// - Stage recommendation in DB
// - If EXECUTION_MODE=live and autoEligible -> attempt execution (post-draft only)
// - If EXECUTION_MODE=dry-run -> mark as DRY_RUN
import { env } from '../config/env';
import { POLICY } from '../config/policy';
import { prisma } from '../db';
import { shouldAutoExecute } from '../guards/shouldExecute';
import {
  yfForUser,
  getGameKey,
  leagueKeyFor,
  userTeamKey,
  isLeaguePostDraft,
  callYahoo,
} from '../services/yahoo';

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

export async function proposeOrExecute({
  leagueId,
  userId,
  actions,
}: {
  leagueId: string;
  userId: string;
  actions: Action[];
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
      fabBid: a.fabBid ?? (null as any),
      fabRemaining: a.fabRemaining ?? (null as any),
    });

    // Stage recommendation (MVP). Execution via Yahoo will be added later.
    // Default behavior is to stage; can be overridden by live execution below
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

    // Optional live execution if: eligible, mode=live, and league is postdraft
    // Live execution attempt (post-draft only)
    if (autoEligible && env.EXECUTION_MODE === 'live') {
      try {
        const yf = await yfForUser(userId);
        const gameKey = await getGameKey(yf, 'nfl');
        const leagueKey = leagueKeyFor(gameKey, leagueId);
        const okDraft = await isLeaguePostDraft(yf, leagueKey);
        if (!okDraft) {
          results.push({ id: rec.id, status: 'STAGED', autoEligible, note: 'blocked_pre_draft' });
          continue;
        }
        const teamKey = await userTeamKey(yf, gameKey, leagueKey);
        if (!teamKey) {
          results.push({ id: rec.id, status: 'STAGED', autoEligible, note: 'team_key_not_found' });
          continue;
        }
        // Execute the action via Yahoo API
        const execRes = await callYahoo({ leagueKey, teamKey, action: a, yf });
        if (execRes?.success) {
          await prisma.recommendation.update({
            where: { id: rec.id },
            data: { status: 'EXECUTED' },
          });
          results.push({ id: rec.id, status: 'EXECUTED', autoEligible });
        } else {
          results.push({
            id: rec.id,
            status: 'STAGED',
            autoEligible,
            note: execRes?.reason || 'not_implemented',
          });
        }
      } catch (err: any) {
        console.error('Executor live execution error:', err);
        results.push({
          id: rec.id,
          status: 'STAGED',
          autoEligible,
          error: err?.message || 'execution_error',
        });
      }
    } else if (env.EXECUTION_MODE === 'dry-run') {
      results.push({ id: rec.id, status: 'DRY_RUN', autoEligible });
    } else {
      results.push({ id: rec.id, status: 'STAGED', autoEligible });
    }
  }

  return { results };
}
