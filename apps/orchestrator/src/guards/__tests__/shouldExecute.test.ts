import { describe, it, expect } from 'vitest';
import { shouldAutoExecute } from '../shouldExecute';

describe('shouldAutoExecute', () => {
  it('returns false when confidence below execute threshold, even for injury-out swap', () => {
    expect(
      shouldAutoExecute({ type: 'LINEUP_SWAP', confidence: 0.79, isInjuryOut: true })
    ).toBe(false);
  });

  it('auto-executes injury-out LINEUP_SWAP when confidence is high', () => {
    expect(
      shouldAutoExecute({ type: 'LINEUP_SWAP', confidence: 0.85, isInjuryOut: true })
    ).toBe(true);
  });

  it('auto-executes WAIVER when bid <= 3% of remaining FAB and confidence is high', () => {
    // POLICY.fab.autoExecuteBudgetPct = 0.03 (3%)
    expect(
      shouldAutoExecute({ type: 'WAIVER', confidence: 0.9, fabBid: 3, fabRemaining: 100 })
    ).toBe(true);
  });

  it('does not auto-execute WAIVER when bid > 3% of remaining FAB', () => {
    expect(
      shouldAutoExecute({ type: 'WAIVER', confidence: 0.9, fabBid: 4, fabRemaining: 100 })
    ).toBe(false);
  });

  it('handles zero FAB remaining safely (no auto-exec)', () => {
    expect(
      shouldAutoExecute({ type: 'WAIVER', confidence: 0.9, fabBid: 1, fabRemaining: 0 })
    ).toBe(false);
  });

  it('does not auto-execute WAIVER when fabBid or fabRemaining missing', () => {
    // Missing numbers means budget check cannot pass
    expect(
      shouldAutoExecute({ type: 'WAIVER', confidence: 0.9 })
    ).toBe(false);
  });
});

