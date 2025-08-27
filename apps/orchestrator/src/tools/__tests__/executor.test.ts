import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  mockPrismaClient, 
  setupPrismaMocks, 
  resetPrismaMocks
} from '../../__tests__/mocks/prisma.mock';
import { 
  mockYahooClient, 
  setupYahooMocks, 
  resetYahooMocks 
} from '../../__tests__/mocks/yahoo-api.mock';

// Mock the Yahoo service
vi.mock('../../services/yahoo', () => ({
  yfForUser: vi.fn().mockResolvedValue(mockYahooClient),
  getGameKey: vi.fn().mockResolvedValue('431'),
  leagueKeyFor: vi.fn().mockReturnValue('431.l.123456'),
  userTeamKey: vi.fn().mockResolvedValue('431.l.123456.t.1'),
  isLeaguePostDraft: vi.fn().mockResolvedValue(true),
  callYahoo: vi.fn().mockResolvedValue({ success: true, transactionId: 'trans_123' })
}));

// Mock the policy and environment
vi.mock('../../config/policy', () => ({
  POLICY: {
    confidence: { execute: 0.80, stageMin: 0.60 },
    fab: { autoExecuteBudgetPct: 0.03 }
  }
}));

vi.mock('../../config/env', () => ({
  env: {
    EXECUTION_MODE: 'dry-run'
  }
}));

vi.mock('../../guards/shouldExecute', () => ({
  shouldAutoExecute: vi.fn()
}));

describe('Executor Tool', () => {
  beforeEach(() => {
    resetPrismaMocks();
    resetYahooMocks();
    setupPrismaMocks();
    setupYahooMocks();
    vi.clearAllMocks();
  });

  describe('proposeOrExecute', () => {
    const baseInput = {
      leagueId: '123456',
      userId: 'test-user-1',
      actions: []
    };

    it('skips actions below staging confidence threshold', async () => {
      const input = {
        ...baseInput,
        actions: [
          {
            id: 'action1',
            type: 'WAIVER',
            summary: 'Low confidence waiver',
            confidence: 0.55, // Below 0.60 stageMin
            fabBid: 10
          }
        ]
      };

      const result = await proposeOrExecute(input);

      expect(result.results).toHaveLength(1);
      expect(result.results[0].status).toBe('SKIPPED_LOW_CONFIDENCE');
      expect(result.results[0].autoEligible).toBe(false);
      expect(mockPrismaClient.recommendation.create).not.toHaveBeenCalled();
    });

    it('stages actions above confidence threshold', async () => {
      const { proposeOrExecute } = await import('../executor');
      const { shouldAutoExecute } = await import('../../guards/shouldExecute');
      vi.mocked(shouldAutoExecute).mockReturnValue(false);

      mockPrismaClient.recommendation.create.mockResolvedValue({
        id: 'rec_123',
        status: 'STAGED'
      });

      const input = {
        ...baseInput,
        actions: [
          {
            id: 'action1',
            type: 'WAIVER',
            summary: 'Medium confidence waiver',
            confidence: 0.70,
            fabBid: 15,
            fabRemaining: 100
          }
        ]
      };

      const result = await proposeOrExecute(input);

      expect(mockPrismaClient.recommendation.create).toHaveBeenCalledWith({
        data: {
          leagueId: '123456',
          type: 'WAIVER',
          summary: 'Medium confidence waiver',
          payload: input.actions[0],
          confidence: 0.70,
          fabBid: 15,
          autoEligible: false,
          status: 'STAGED'
        }
      });

      expect(result.results[0].status).toBe('STAGED');
    });

    it('correctly determines auto-eligible status', async () => {
      const mockShouldAutoExecute = require('../../guards/shouldExecute').shouldAutoExecute;
      mockShouldAutoExecute.mockReturnValue(true);

      const input = {
        ...baseInput,
        actions: [
          {
            id: 'action1',
            type: 'LINEUP_SWAP',
            summary: 'Injury replacement',
            confidence: 0.85,
            reason: 'INJURY_OUT',
            isInjuryOut: true
          }
        ]
      };

      await proposeOrExecute(input);

      expect(mockShouldAutoExecute).toHaveBeenCalledWith({
        type: 'LINEUP_SWAP',
        confidence: 0.85,
        isInjuryOut: true,
        fabBid: null,
        fabRemaining: null
      });

      expect(mockPrismaClient.recommendation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            autoEligible: true
          })
        })
      );
    });

    it('executes auto-eligible actions in live mode', async () => {
      // Mock live execution mode
      vi.doMock('../../config/env', () => ({
        env: {
          EXECUTION_MODE: 'live'
        }
      }));

      const mockShouldAutoExecute = require('../../guards/shouldExecute').shouldAutoExecute;
      mockShouldAutoExecute.mockReturnValue(true);

      const mockCallYahoo = require('../services/yahoo').callYahoo;
      mockCallYahoo.mockResolvedValue({ success: true, transactionId: 'trans_123' });

      mockPrismaClient.recommendation.create.mockResolvedValue({
        id: 'rec_123',
        status: 'STAGED'
      });

      const input = {
        ...baseInput,
        actions: [
          {
            id: 'action1',
            type: 'LINEUP_SWAP',
            summary: 'Auto-executable swap',
            confidence: 0.85,
            isInjuryOut: true
          }
        ]
      };

      // Need to reload the module to get the updated env mock
      vi.resetModules();
      const { proposeOrExecute: reloadedExecutor } = await import('../executor');
      
      const result = await reloadedExecutor(input);

      expect(result.results[0].status).toBe('EXECUTED');
      expect(mockPrismaClient.recommendation.update).toHaveBeenCalledWith({
        where: { id: 'rec_123' },
        data: { status: 'EXECUTED' }
      });
    });

    it('blocks execution when league is pre-draft', async () => {
      vi.doMock('../../config/env', () => ({
        env: { EXECUTION_MODE: 'live' }
      }));

      const mockShouldAutoExecute = require('../../guards/shouldExecute').shouldAutoExecute;
      mockShouldAutoExecute.mockReturnValue(true);

      const mockIsLeaguePostDraft = require('../services/yahoo').isLeaguePostDraft;
      mockIsLeaguePostDraft.mockResolvedValue(false);

      mockPrismaClient.recommendation.create.mockResolvedValue({
        id: 'rec_123',
        status: 'STAGED'
      });

      const input = {
        ...baseInput,
        actions: [
          {
            id: 'action1',
            type: 'WAIVER',
            summary: 'Pre-draft blocked action',
            confidence: 0.85,
            fabBid: 10,
            fabRemaining: 100
          }
        ]
      };

      vi.resetModules();
      const { proposeOrExecute: reloadedExecutor } = await import('../executor');
      
      const result = await reloadedExecutor(input);

      expect(result.results[0].status).toBe('STAGED');
      expect(result.results[0].note).toBe('blocked_pre_draft');
    });

    it('handles missing team key gracefully', async () => {
      vi.doMock('../../config/env', () => ({
        env: { EXECUTION_MODE: 'live' }
      }));

      const mockShouldAutoExecute = require('../../guards/shouldExecute').shouldAutoExecute;
      mockShouldAutoExecute.mockReturnValue(true);

      const mockUserTeamKey = require('../services/yahoo').userTeamKey;
      mockUserTeamKey.mockResolvedValue(null);

      const input = {
        ...baseInput,
        actions: [
          {
            id: 'action1',
            type: 'WAIVER',
            summary: 'No team key action',
            confidence: 0.85,
            fabBid: 10,
            fabRemaining: 100
          }
        ]
      };

      vi.resetModules();
      const { proposeOrExecute: reloadedExecutor } = await import('../executor');
      
      const result = await reloadedExecutor(input);

      expect(result.results[0].status).toBe('STAGED');
      expect(result.results[0].note).toBe('team_key_not_found');
    });

    it('handles Yahoo API execution failures', async () => {
      vi.doMock('../../config/env', () => ({
        env: { EXECUTION_MODE: 'live' }
      }));

      const mockShouldAutoExecute = require('../../guards/shouldExecute').shouldAutoExecute;
      mockShouldAutoExecute.mockReturnValue(true);

      const mockCallYahoo = require('../services/yahoo').callYahoo;
      mockCallYahoo.mockResolvedValue({ 
        success: false, 
        reason: 'TRANSACTION_FAILED' 
      });

      const input = {
        ...baseInput,
        actions: [
          {
            id: 'action1',
            type: 'WAIVER',
            summary: 'Failed execution',
            confidence: 0.85,
            fabBid: 10,
            fabRemaining: 100
          }
        ]
      };

      vi.resetModules();
      const { proposeOrExecute: reloadedExecutor } = await import('../executor');
      
      const result = await reloadedExecutor(input);

      expect(result.results[0].status).toBe('STAGED');
      expect(result.results[0].note).toBe('TRANSACTION_FAILED');
    });

    it('marks actions as DRY_RUN in dry-run mode', async () => {
      const mockShouldAutoExecute = require('../../guards/shouldExecute').shouldAutoExecute;
      mockShouldAutoExecute.mockReturnValue(true);

      const input = {
        ...baseInput,
        actions: [
          {
            id: 'action1',
            type: 'WAIVER',
            summary: 'Dry run action',
            confidence: 0.85,
            fabBid: 10,
            fabRemaining: 100
          }
        ]
      };

      const result = await proposeOrExecute(input);

      expect(result.results[0].status).toBe('DRY_RUN');
      expect(result.results[0].autoEligible).toBe(true);
    });

    it('processes multiple actions correctly', async () => {
      const mockShouldAutoExecute = require('../../guards/shouldExecute').shouldAutoExecute;
      mockShouldAutoExecute
        .mockReturnValueOnce(false) // First action not auto-eligible
        .mockReturnValueOnce(true);  // Second action auto-eligible

      mockPrismaClient.recommendation.create
        .mockResolvedValueOnce({ id: 'rec_1', status: 'STAGED' })
        .mockResolvedValueOnce({ id: 'rec_2', status: 'STAGED' });

      const input = {
        ...baseInput,
        actions: [
          {
            id: 'action1',
            type: 'WAIVER',
            summary: 'Manual approval needed',
            confidence: 0.65,
            fabBid: 20,
            fabRemaining: 100
          },
          {
            id: 'action2',
            type: 'LINEUP_SWAP',
            summary: 'Auto-executable swap',
            confidence: 0.85,
            isInjuryOut: true
          }
        ]
      };

      const result = await proposeOrExecute(input);

      expect(result.results).toHaveLength(2);
      expect(result.results[0].autoEligible).toBe(false);
      expect(result.results[1].autoEligible).toBe(true);
      expect(mockPrismaClient.recommendation.create).toHaveBeenCalledTimes(2);
    });

    it('handles execution errors gracefully', async () => {
      vi.doMock('../../config/env', () => ({
        env: { EXECUTION_MODE: 'live' }
      }));

      const mockShouldAutoExecute = require('../../guards/shouldExecute').shouldAutoExecute;
      mockShouldAutoExecute.mockReturnValue(true);

      const mockCallYahoo = require('../services/yahoo').callYahoo;
      mockCallYahoo.mockRejectedValue(new Error('Network error'));

      const input = {
        ...baseInput,
        actions: [
          {
            id: 'action1',
            type: 'WAIVER',
            summary: 'Network error action',
            confidence: 0.85,
            fabBid: 10,
            fabRemaining: 100
          }
        ]
      };

      vi.resetModules();
      const { proposeOrExecute: reloadedExecutor } = await import('../executor');
      
      const result = await reloadedExecutor(input);

      expect(result.results[0].status).toBe('STAGED');
      expect(result.results[0].error).toBe('Network error');
    });
  });
});