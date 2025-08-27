import { describe, it, expect } from 'vitest';
import { shouldAutoExecute } from '../shouldExecute';

describe('shouldAutoExecute', () => {
  describe('confidence thresholds', () => {
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

    it('respects exact confidence boundary at 80%', () => {
      expect(
        shouldAutoExecute({ type: 'LINEUP_SWAP', confidence: 0.8, isInjuryOut: true })
      ).toBe(true);
      
      expect(
        shouldAutoExecute({ type: 'LINEUP_SWAP', confidence: 0.799999, isInjuryOut: true })
      ).toBe(false);
    });

    it('handles high confidence values (>1) correctly', () => {
      // Values > 1 should still work (e.g. if someone passes 80 instead of 0.8)
      expect(
        shouldAutoExecute({ type: 'LINEUP_SWAP', confidence: 80, isInjuryOut: true })
      ).toBe(true);
      
      // But values less than threshold should fail even if > 1
      expect(
        shouldAutoExecute({ type: 'LINEUP_SWAP', confidence: 0.79, isInjuryOut: true })
      ).toBe(false);
    });
  });

  describe('WAIVER auto-execution rules', () => {
    it('auto-executes WAIVER when bid <= 3% of remaining FAB and confidence is high', () => {
      expect(
        shouldAutoExecute({ type: 'WAIVER', confidence: 0.9, fabBid: 3, fabRemaining: 100 })
      ).toBe(true);
    });

    it('does not auto-execute WAIVER when bid > 3% of remaining FAB', () => {
      expect(
        shouldAutoExecute({ type: 'WAIVER', confidence: 0.9, fabBid: 4, fabRemaining: 100 })
      ).toBe(false);
    });

    it('handles exact FAB percentage boundary (3%)', () => {
      expect(
        shouldAutoExecute({ type: 'WAIVER', confidence: 0.9, fabBid: 3, fabRemaining: 100 })
      ).toBe(true);
      
      expect(
        shouldAutoExecute({ type: 'WAIVER', confidence: 0.9, fabBid: 3.01, fabRemaining: 100 })
      ).toBe(false);
    });

    it('calculates FAB percentage correctly for various budgets', () => {
      // 2% of $50 = $1.50
      expect(
        shouldAutoExecute({ type: 'WAIVER', confidence: 0.9, fabBid: 1, fabRemaining: 50 })
      ).toBe(true);
      
      // 4% of $50 = $2.00  
      expect(
        shouldAutoExecute({ type: 'WAIVER', confidence: 0.9, fabBid: 2, fabRemaining: 50 })
      ).toBe(false);
    });

    it('handles zero FAB remaining safely (no auto-exec)', () => {
      expect(
        shouldAutoExecute({ type: 'WAIVER', confidence: 0.9, fabBid: 1, fabRemaining: 0 })
      ).toBe(false);
    });

    it('handles negative FAB values safely', () => {
      expect(
        shouldAutoExecute({ type: 'WAIVER', confidence: 0.9, fabBid: 1, fabRemaining: -10 })
      ).toBe(false);
    });

    it('does not auto-execute WAIVER when fabBid or fabRemaining missing', () => {
      expect(
        shouldAutoExecute({ type: 'WAIVER', confidence: 0.9 })
      ).toBe(false);
      
      expect(
        shouldAutoExecute({ type: 'WAIVER', confidence: 0.9, fabBid: 5 })
      ).toBe(false);
      
      expect(
        shouldAutoExecute({ type: 'WAIVER', confidence: 0.9, fabRemaining: 100 })
      ).toBe(false);
    });

    it('handles $0 bid correctly', () => {
      expect(
        shouldAutoExecute({ type: 'WAIVER', confidence: 0.9, fabBid: 0, fabRemaining: 100 })
      ).toBe(true);
    });
  });

  describe('LINEUP_SWAP rules', () => {
    it('requires injury-out status for auto-execution', () => {
      expect(
        shouldAutoExecute({ type: 'LINEUP_SWAP', confidence: 0.9, isInjuryOut: false })
      ).toBe(false);
      
      expect(
        shouldAutoExecute({ type: 'LINEUP_SWAP', confidence: 0.9 })
      ).toBe(false);
    });

    it('requires both high confidence AND injury-out status', () => {
      expect(
        shouldAutoExecute({ type: 'LINEUP_SWAP', confidence: 0.75, isInjuryOut: true })
      ).toBe(false);
      
      expect(
        shouldAutoExecute({ type: 'LINEUP_SWAP', confidence: 0.85, isInjuryOut: false })
      ).toBe(false);
    });
  });

  describe('edge cases and validation', () => {
    it('handles unknown action types safely', () => {
      expect(
        shouldAutoExecute({ type: 'UNKNOWN_TYPE' as any, confidence: 0.9 })
      ).toBe(false);
    });

    it('handles null/undefined confidence values', () => {
      expect(
        shouldAutoExecute({ type: 'LINEUP_SWAP', confidence: null as any, isInjuryOut: true })
      ).toBe(false);
      
      expect(
        shouldAutoExecute({ type: 'LINEUP_SWAP', confidence: undefined as any, isInjuryOut: true })
      ).toBe(false);
      
      expect(
        shouldAutoExecute({ type: 'LINEUP_SWAP', confidence: NaN as any, isInjuryOut: true })
      ).toBe(false);
    });

    it('handles extreme confidence values', () => {
      expect(
        shouldAutoExecute({ type: 'LINEUP_SWAP', confidence: 1.5, isInjuryOut: true })
      ).toBe(true);
      
      expect(
        shouldAutoExecute({ type: 'LINEUP_SWAP', confidence: -0.1, isInjuryOut: true })
      ).toBe(false);
    });

    it('handles floating point precision in FAB calculations', () => {
      // Edge case: 3% of $33.33 = $0.9999
      expect(
        shouldAutoExecute({ type: 'WAIVER', confidence: 0.9, fabBid: 1, fabRemaining: 33.33 })
      ).toBe(false); // Should be just over 3%
      
      // Exactly 3% should pass
      expect(
        shouldAutoExecute({ type: 'WAIVER', confidence: 0.9, fabBid: 0.99, fabRemaining: 33 })
      ).toBe(true);
    });
  });
});

