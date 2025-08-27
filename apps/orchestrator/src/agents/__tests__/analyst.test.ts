import { describe, it, expect } from 'vitest';
import { 
  WaiverRecommendationSchema, 
  LineupRecommendationSchema, 
  AnalysisResponseSchema 
} from '../analyst';

describe('Analyst Agent - Schema Validation', () => {
  describe('WaiverRecommendationSchema', () => {
    it('validates correct waiver recommendation', () => {
      const validWaiverRec = {
        player_id: 'nfl.p.12345',
        player_name: 'Handcuff RB',
        position: 'RB',
        fab_bid: 15,
        fab_percentage: 12.5,
        confidence: 85,
        reasoning: 'High-value handcuff with clear path to touches',
        drop_candidate: 'Bench WR',
        risk_factors: ['Injury dependent', 'Timeshare possible'],
        upside_factors: ['Elite offensive line', 'Goal line role'],
        priority_rank: 1
      };

      const result = WaiverRecommendationSchema.safeParse(validWaiverRec);
      expect(result.success).toBe(true);
    });

    it('rejects invalid confidence values', () => {
      const invalidConfidence = {
        player_id: 'nfl.p.12345',
        player_name: 'Test Player',
        position: 'RB',
        fab_bid: 10,
        fab_percentage: 8,
        confidence: 150, // Invalid - over 100
        reasoning: 'Test reasoning',
        risk_factors: [],
        upside_factors: [],
        priority_rank: 1
      };

      const result = WaiverRecommendationSchema.safeParse(invalidConfidence);
      expect(result.success).toBe(false);
    });

    it('handles optional fields correctly', () => {
      const minimalWaiverRec = {
        player_id: 'nfl.p.12345',
        player_name: 'Test Player',
        position: 'WR',
        fab_bid: 5,
        fab_percentage: 4,
        confidence: 70,
        reasoning: 'Minimal test',
        risk_factors: [],
        upside_factors: [],
        priority_rank: 2
        // drop_candidate is optional
      };

      const result = WaiverRecommendationSchema.safeParse(minimalWaiverRec);
      expect(result.success).toBe(true);
    });
  });

  describe('LineupRecommendationSchema', () => {
    it('validates correct lineup recommendation', () => {
      const validLineupRec = {
        player_id: 'nfl.p.23456',
        player_name: 'Star WR',
        action: 'start' as const,
        position_slot: 'WR',
        confidence: 90,
        reasoning: 'Favorable matchup against weak secondary',
        weather_impact: 'Clear skies, no wind',
        matchup_grade: 'A+',
        projected_points: 18.5
      };

      const result = LineupRecommendationSchema.safeParse(validLineupRec);
      expect(result.success).toBe(true);
    });

    it('validates enum constraints', () => {
      const validActions = ['start', 'bench', 'monitor'];
      
      validActions.forEach(action => {
        const rec = {
          player_id: 'nfl.p.12345',
          player_name: 'Test Player',
          action,
          position_slot: 'RB',
          confidence: 75,
          reasoning: 'Test'
        };

        const result = LineupRecommendationSchema.safeParse(rec);
        expect(result.success).toBe(true);
      });
    });

    it('rejects invalid action values', () => {
      const invalidAction = {
        player_id: 'nfl.p.12345',
        player_name: 'Test Player',
        action: 'invalid_action',
        position_slot: 'RB',
        confidence: 75,
        reasoning: 'Test'
      };

      const result = LineupRecommendationSchema.safeParse(invalidAction);
      expect(result.success).toBe(false);
    });
  });

  describe('AnalysisResponseSchema', () => {
    it('validates complete analysis response', () => {
      const completeResponse = {
        summary: 'Week 8 analysis: 3 waiver targets, 2 lineup changes recommended',
        lineup_recommendations: [
          {
            player_id: 'nfl.p.1',
            player_name: 'Player 1',
            action: 'start' as const,
            position_slot: 'RB',
            confidence: 85,
            reasoning: 'Good matchup'
          }
        ],
        waiver_recommendations: [
          {
            player_id: 'nfl.p.2',
            player_name: 'Player 2',
            position: 'WR',
            fab_bid: 12,
            fab_percentage: 10,
            confidence: 80,
            reasoning: 'Breakout candidate',
            risk_factors: ['Unproven'],
            upside_factors: ['Target share'],
            priority_rank: 1
          }
        ],
        key_insights: [
          'RB depth is a concern',
          'WR corps looking strong'
        ],
        risk_alerts: [
          'Starting RB questionable with ankle injury'
        ],
        priority_actions: [
          { type: 'waiver_claim', priority: 'high', player: 'Player 2' }
        ]
      };

      const result = AnalysisResponseSchema.safeParse(completeResponse);
      expect(result.success).toBe(true);
    });

    it('handles empty recommendation arrays', () => {
      const emptyResponse = {
        summary: 'No changes needed this week',
        lineup_recommendations: [],
        waiver_recommendations: [],
        key_insights: ['Team looking solid'],
        risk_alerts: [],
        priority_actions: []
      };

      const result = AnalysisResponseSchema.safeParse(emptyResponse);
      expect(result.success).toBe(true);
    });
  });

  describe('confidence scoring logic', () => {
    it('calculates multi-factor confidence correctly', () => {
      const factors = {
        opportunity: 0.8,  // 80% opportunity score
        matchup: 0.7,      // 70% matchup score  
        volume: 0.9,       // 90% volume projection
        health: 0.6        // 60% health score
      };

      // Weighted average confidence calculation
      const weights = { opportunity: 0.3, matchup: 0.25, volume: 0.3, health: 0.15 };
      const confidence = Math.round(
        Object.entries(factors).reduce((sum, [factor, score]) => {
          return sum + (score * (weights[factor as keyof typeof weights] || 0));
        }, 0) * 100
      );

      expect(confidence).toBe(76); // Should be 76%
    });

    it('caps confidence at reasonable bounds', () => {
      const extremeHighFactors = {
        opportunity: 1.0,
        matchup: 1.0,
        volume: 1.0,
        health: 1.0
      };

      const weights = { opportunity: 0.3, matchup: 0.25, volume: 0.3, health: 0.15 };
      const maxConfidence = Math.min(100, Math.round(
        Object.entries(extremeHighFactors).reduce((sum, [factor, score]) => {
          return sum + (score * (weights[factor as keyof typeof weights] || 0));
        }, 0) * 100
      ));

      expect(maxConfidence).toBe(100);
    });
  });

  describe('FAB bid calculation', () => {
    it('calculates appropriate FAB bids', () => {
      const testScenarios = [
        { confidence: 90, budget: 100, expected: 15 },  // High confidence = higher bid
        { confidence: 70, budget: 100, expected: 8 },   // Medium confidence = medium bid
        { confidence: 60, budget: 100, expected: 3 },   // Low confidence = low bid
        { confidence: 90, budget: 50, expected: 7 },    // Adjust for smaller budget
      ];

      testScenarios.forEach(({ confidence, budget, expected }) => {
        // Simple bid calculation: (confidence - 50) / 50 * maxBid
        const maxBid = Math.floor(budget * 0.15); // Max 15% of budget
        const calculatedBid = Math.max(1, Math.floor(((confidence - 50) / 50) * maxBid));
        
        expect(calculatedBid).toBeCloseTo(expected, 0);
      });
    });

    it('respects minimum and maximum bid constraints', () => {
      const budget = 100;
      const minBid = 1;
      const maxBid = Math.floor(budget * 0.2); // 20% max

      // Very low confidence should still bid minimum
      const lowBid = Math.max(minBid, Math.floor(((50 - 50) / 50) * maxBid));
      expect(lowBid).toBe(minBid);

      // Very high confidence should not exceed maximum  
      const highBid = Math.min(maxBid, Math.floor(((100 - 50) / 50) * maxBid));
      expect(highBid).toBe(maxBid);
    });
  });

  describe('risk assessment', () => {
    it('identifies common risk factors', () => {
      const commonRiskFactors = [
        'Injury prone',
        'Inconsistent usage', 
        'Tough schedule ahead',
        'Committee backfield',
        'Weather dependent',
        'Game script risk'
      ];

      const playerProfile = {
        injuryHistory: ['hamstring', 'ankle'],
        usageVariance: 0.4, // High variance
        upcomingMatchups: ['vs #1 DEF', 'vs #3 DEF'],
        position: 'RB'
      };

      const risks: string[] = [];
      
      if (playerProfile.injuryHistory.length >= 2) risks.push('Injury prone');
      if (playerProfile.usageVariance > 0.3) risks.push('Inconsistent usage');
      if (playerProfile.upcomingMatchups.some(m => m.includes('#1') || m.includes('#2'))) {
        risks.push('Tough schedule ahead');
      }

      expect(risks).toContain('Injury prone');
      expect(risks).toContain('Inconsistent usage'); 
      expect(risks).toContain('Tough schedule ahead');
    });

    it('weighs risks appropriately in confidence calculation', () => {
      const baseConfidence = 80;
      const risks = ['Injury prone', 'Committee backfield'];
      
      // Each risk factor reduces confidence by 5-10 points
      const riskPenalty = risks.length * 7; // 7 points per risk
      const adjustedConfidence = Math.max(50, baseConfidence - riskPenalty);

      expect(adjustedConfidence).toBe(66); // 80 - (2 * 7) = 66
    });
  });
});