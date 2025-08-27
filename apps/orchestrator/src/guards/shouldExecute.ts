import { POLICY } from '../config/policy';

export function shouldAutoExecute(rec: {
  type: 'WAIVER'|'LINEUP_SWAP';
  confidence: number;
  isInjuryOut?: boolean;
  fabBid?: number;              // absolute FAB bid
  fabRemaining?: number;        // team's remaining FAB
}) {
  // Always gate by confidence first - ensure it's a valid number
  if (typeof rec.confidence !== 'number' || isNaN(rec.confidence) || rec.confidence < POLICY.confidence.execute) return false;

  if (rec.type === 'LINEUP_SWAP' && rec.isInjuryOut && POLICY.autoSwapInjuryOut) {
    return true;
  }

  if (rec.type === 'WAIVER' && rec.fabBid != null && rec.fabRemaining != null) {
    const pct = rec.fabBid / Math.max(rec.fabRemaining, 1);
    if (pct <= POLICY.fab.autoExecuteBudgetPct) return true;
  }

  return false;
}