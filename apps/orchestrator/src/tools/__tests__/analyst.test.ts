import { describe, it, expect, vi } from 'vitest';

// Test the FLEX_MAP logic from analyst tool
const FLEX_MAP: Record<string, string[]> = {
  'W/R/T': ['WR', 'RB', 'TE'],
  'WR/RB': ['WR', 'RB'], 
  'Q/W/R/T': ['QB', 'WR', 'RB', 'TE'],
  'FLEX': ['WR', 'RB', 'TE'],
};

// Can a player with eligible positions fill a lineup slot (including flex rules)?
function canFill(slot: string, eligible: string[]): boolean {
  if (!slot) return false;
  if (eligible.includes(slot)) return true;
  const flex = FLEX_MAP[slot];
  return Array.isArray(flex) && flex.some((p) => eligible.includes(p));
}

describe('Analyst Tool - Position Logic', () => {
  describe('canFill function', () => {
    it('allows direct position matches', () => {
      expect(canFill('QB', ['QB'])).toBe(true);
      expect(canFill('RB', ['RB', 'WR'])).toBe(true);
      expect(canFill('WR', ['WR'])).toBe(true);
      expect(canFill('TE', ['TE'])).toBe(true);
    });

    it('rejects non-matching positions', () => {
      expect(canFill('QB', ['WR'])).toBe(false);
      expect(canFill('RB', ['TE'])).toBe(false);
      expect(canFill('K', ['QB'])).toBe(false);
    });

    it('handles FLEX positions correctly', () => {
      expect(canFill('W/R/T', ['WR'])).toBe(true);
      expect(canFill('W/R/T', ['RB'])).toBe(true);
      expect(canFill('W/R/T', ['TE'])).toBe(true);
      expect(canFill('W/R/T', ['QB'])).toBe(false);
    });

    it('handles WR/RB flex correctly', () => {
      expect(canFill('WR/RB', ['WR'])).toBe(true);
      expect(canFill('WR/RB', ['RB'])).toBe(true);
      expect(canFill('WR/RB', ['TE'])).toBe(false);
      expect(canFill('WR/RB', ['QB'])).toBe(false);
    });

    it('handles superflex (Q/W/R/T) correctly', () => {
      expect(canFill('Q/W/R/T', ['QB'])).toBe(true);
      expect(canFill('Q/W/R/T', ['WR'])).toBe(true);
      expect(canFill('Q/W/R/T', ['RB'])).toBe(true);
      expect(canFill('Q/W/R/T', ['TE'])).toBe(true);
      expect(canFill('Q/W/R/T', ['K'])).toBe(false);
    });

    it('handles edge cases', () => {
      expect(canFill('', ['QB'])).toBe(false);
      expect(canFill('QB', [])).toBe(false);
      expect(canFill('UNKNOWN_FLEX', ['WR'])).toBe(false);
    });

    it('handles multi-position eligible players', () => {
      expect(canFill('RB', ['RB', 'WR'])).toBe(true);
      expect(canFill('WR', ['RB', 'WR'])).toBe(true);
      expect(canFill('FLEX', ['RB', 'WR'])).toBe(true);
      expect(canFill('QB', ['RB', 'WR'])).toBe(false);
    });
  });

  describe('injury status filtering', () => {
    const mockRoster = [
      { player_id: '1', name: { full: 'Healthy Player' }, status: 'HEALTHY' },
      { player_id: '2', name: { full: 'Out Player' }, status: 'O' },
      { player_id: '3', name: { full: 'Questionable Player' }, status: 'Q' },
      { player_id: '4', name: { full: 'Doubtful Player' }, status: 'D' },
      { player_id: '5', name: { full: 'IR Player' }, status: 'IR' },
      { player_id: '6', name: { full: 'No Status' } }
    ];

    it('filters injured players correctly', () => {
      const out = mockRoster.filter(p => /^(O|OUT)$/i.test(p.status || ''));
      const questionable = mockRoster.filter(p => /^(Q|Questionable)$/i.test(p.status || ''));
      const doubtful = mockRoster.filter(p => /^(D|Doubtful)$/i.test(p.status || ''));
      const ir = mockRoster.filter(p => /IR|PUP|NFI|SUSP/i.test(p.status || ''));

      expect(out).toHaveLength(1);
      expect(out[0].player_id).toBe('2');
      
      expect(questionable).toHaveLength(1);
      expect(questionable[0].player_id).toBe('3');
      
      expect(doubtful).toHaveLength(1);
      expect(doubtful[0].player_id).toBe('4');
      
      expect(ir).toHaveLength(1);
      expect(ir[0].player_id).toBe('5');
    });

    it('identifies players needing attention', () => {
      const needsAttention = mockRoster.filter(p => 
        /^(Q|D|O|IR|PUP|NFI|SUSP)$/i.test(p.status || '')
      );

      expect(needsAttention).toHaveLength(4);
      expect(needsAttention.map(p => p.player_id)).toEqual(['2', '3', '4', '5']);
    });
  });

  describe('analysis decision logic', () => {
    it('should prefer heuristic analysis for simple cases', () => {
      const simpleScenario = {
        injuredPlayers: 0,
        flexEligiblePlayers: 2,
        marginalDecisions: 1
      };

      // Simple scenario should not trigger AI analysis
      const shouldUseAI = simpleScenario.injuredPlayers >= 2 || 
                          simpleScenario.flexEligiblePlayers >= 4 ||
                          simpleScenario.marginalDecisions >= 3;

      expect(shouldUseAI).toBe(false);
    });

    it('should trigger AI analysis for complex scenarios', () => {
      const complexScenario = {
        injuredPlayers: 3,
        flexEligiblePlayers: 5,
        marginalDecisions: 4
      };

      const shouldUseAI = complexScenario.injuredPlayers >= 2 || 
                          complexScenario.flexEligiblePlayers >= 4 ||
                          complexScenario.marginalDecisions >= 3;

      expect(shouldUseAI).toBe(true);
    });
  });

  describe('starter/bench classification', () => {
    const mockRoster = [
      { player_id: '1', selected_position: 'QB', name: { full: 'Starting QB' }},
      { player_id: '2', selected_position: 'BN', name: { full: 'Bench Player' }},
      { player_id: '3', selected_position: 'RB', name: { full: 'Starting RB' }},
      { player_id: '4', selected_position: undefined, name: { full: 'Unset Player' }}
    ];

    it('correctly identifies starters and bench players', () => {
      const starters = mockRoster.filter(p => p.selected_position && p.selected_position !== 'BN');
      const bench = mockRoster.filter(p => !p.selected_position || p.selected_position === 'BN');

      expect(starters).toHaveLength(2);
      expect(starters.map(p => p.player_id)).toEqual(['1', '3']);
      
      expect(bench).toHaveLength(2); 
      expect(bench.map(p => p.player_id)).toEqual(['2', '4']);
    });
  });
});