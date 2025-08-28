import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import {
  mockPrismaClient,
  setupPrismaMocks,
  resetPrismaMocks,
} from '../../__tests__/mocks/prisma.mock';
import {
  mockYahooClient,
  setupYahooMocks,
  resetYahooMocks,
} from '../../__tests__/mocks/yahoo-api.mock';

// Mock the Yahoo service
vi.mock('../../services/yahoo', () => ({
  yfForUser: vi.fn().mockResolvedValue(mockYahooClient),
  getGameKey: vi.fn().mockResolvedValue('431'),
  leagueKeyFor: vi.fn().mockReturnValue('431.l.123456'),
  userTeamKey: vi.fn().mockResolvedValue('431.l.123456.t.1'),
  isLeaguePostDraft: vi.fn().mockResolvedValue(true),
  callYahoo: vi.fn().mockResolvedValue({ success: true, transactionId: 'trans_123' }),
}));

// Mock the policy and environment
vi.mock('../../config/policy', () => ({
  POLICY: {
    confidence: { execute: 0.8, stageMin: 0.6 },
    fab: { autoExecuteBudgetPct: 0.03 },
  },
}));

vi.mock('../../config/env', () => ({
  env: {
    EXECUTION_MODE: 'dry-run',
  },
}));

vi.mock('../../guards/shouldExecute', () => ({
  shouldAutoExecute: vi.fn(),
}));

describe('Executor Tool', () => {
  beforeAll(async () => {
    // Database connection established in global setup
  });

  afterAll(async () => {
    // Database cleanup handled in global teardown
  });

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
      actions: [],
    };

    it('skips actions below staging confidence threshold', async () => {
      const { proposeOrExecute } = await import('../executor');

      const input = {
        ...baseInput,
        actions: [
          {
            id: 'action1',
            type: 'WAIVER',
            summary: 'Low confidence waiver',
            confidence: 0.55, // Below 0.60 stageMin
            fabBid: 10,
          },
        ],
      };

      const result = await proposeOrExecute(input);

      expect(result.results).toHaveLength(1);
      expect(result.results[0].status).toBe('SKIPPED_LOW_CONFIDENCE');
      expect(result.results[0].autoEligible).toBe(false);
      expect(mockPrismaClient.recommendation.create).not.toHaveBeenCalled();
    });

    it('stages actions above confidence threshold', async () => {
      const mockShouldAutoExecute = vi.fn().mockReturnValue(false);
      vi.doMock('../../guards/shouldExecute', () => ({
        shouldAutoExecute: mockShouldAutoExecute,
      }));

      // Mock staging execution mode so it stages instead of dry-run
      vi.doMock('../../config/env', () => ({
        env: {
          EXECUTION_MODE: 'staging',
        },
      }));

      // Re-import after mocking
      vi.resetModules();
      const { proposeOrExecute } = await import('../executor');

      mockPrismaClient.recommendation.create.mockResolvedValue({
        id: 'rec_123',
        status: 'STAGED',
      });

      const input = {
        ...baseInput,
        actions: [
          {
            id: 'action1',
            type: 'WAIVER',
            summary: 'Medium confidence waiver',
            confidence: 0.7,
            fabBid: 15,
            fabRemaining: 100,
          },
        ],
      };

      const result = await proposeOrExecute(input);

      expect(mockPrismaClient.recommendation.create).toHaveBeenCalledWith({
        data: {
          leagueId: '123456',
          type: 'WAIVER',
          summary: 'Medium confidence waiver',
          payload: input.actions[0],
          confidence: 0.7,
          fabBid: 15,
          autoEligible: false,
          status: 'STAGED',
        },
      });

      expect(result.results[0].status).toBe('STAGED');
    });

    it('correctly determines auto-eligible status', async () => {
      const mockShouldAutoExecute = vi.fn().mockReturnValue(true);
      vi.doMock('../../guards/shouldExecute', () => ({
        shouldAutoExecute: mockShouldAutoExecute,
      }));

      vi.resetModules();

      const input = {
        ...baseInput,
        actions: [
          {
            id: 'action1',
            type: 'LINEUP_SWAP',
            summary: 'Injury replacement',
            confidence: 0.85,
            reason: 'INJURY_OUT',
            isInjuryOut: true,
          },
        ],
      };

      const { proposeOrExecute } = await import('../executor');
      await proposeOrExecute(input);

      expect(mockShouldAutoExecute).toHaveBeenCalledWith({
        type: 'LINEUP_SWAP',
        confidence: 0.85,
        isInjuryOut: true,
        fabBid: null,
        fabRemaining: null,
      });

      expect(mockPrismaClient.recommendation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            autoEligible: true,
          }),
        })
      );
    });

    it('executes auto-eligible actions in live mode', async () => {
      // Mock live execution mode
      vi.doMock('../../config/env', () => ({
        env: {
          EXECUTION_MODE: 'live',
        },
      }));

      const mockShouldAutoExecute = vi.fn().mockReturnValue(true);
      vi.doMock('../../guards/shouldExecute', () => ({
        shouldAutoExecute: mockShouldAutoExecute,
      }));

      const mockCallYahoo = vi
        .fn()
        .mockResolvedValue({ success: true, transactionId: 'trans_123' });
      vi.doMock('../../services/yahoo', () => ({
        yfForUser: vi.fn().mockResolvedValue(mockYahooClient),
        getGameKey: vi.fn().mockResolvedValue('431'),
        leagueKeyFor: vi.fn().mockReturnValue('431.l.123456'),
        userTeamKey: vi.fn().mockResolvedValue('431.l.123456.t.1'),
        isLeaguePostDraft: vi.fn().mockResolvedValue(true),
        callYahoo: mockCallYahoo,
      }));

      mockPrismaClient.recommendation.create.mockResolvedValue({
        id: 'rec_123',
        status: 'STAGED',
      });

      const input = {
        ...baseInput,
        actions: [
          {
            id: 'action1',
            type: 'LINEUP_SWAP',
            summary: 'Auto-executable swap',
            confidence: 0.85,
            isInjuryOut: true,
          },
        ],
      };

      // Need to reload the module to get the updated env mock
      vi.resetModules();
      const { proposeOrExecute: reloadedExecutor } = await import('../executor');

      const result = await reloadedExecutor(input);

      expect(result.results[0].status).toBe('EXECUTED');
      expect(mockPrismaClient.recommendation.update).toHaveBeenCalledWith({
        where: { id: 'rec_123' },
        data: { status: 'EXECUTED' },
      });
    });

    it('blocks execution when league is pre-draft', async () => {
      vi.doMock('../../config/env', () => ({
        env: { EXECUTION_MODE: 'live' },
      }));

      const mockShouldAutoExecute = vi.fn().mockReturnValue(true);
      vi.doMock('../../guards/shouldExecute', () => ({
        shouldAutoExecute: mockShouldAutoExecute,
      }));

      const mockIsLeaguePostDraft = vi.fn().mockResolvedValue(false);
      vi.doMock('../../services/yahoo', () => ({
        yfForUser: vi.fn().mockResolvedValue(mockYahooClient),
        getGameKey: vi.fn().mockResolvedValue('431'),
        leagueKeyFor: vi.fn().mockReturnValue('431.l.123456'),
        userTeamKey: vi.fn().mockResolvedValue('431.l.123456.t.1'),
        isLeaguePostDraft: mockIsLeaguePostDraft,
        callYahoo: vi.fn().mockResolvedValue({ success: true, transactionId: 'trans_123' }),
      }));

      mockPrismaClient.recommendation.create.mockResolvedValue({
        id: 'rec_123',
        status: 'STAGED',
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
            fabRemaining: 100,
          },
        ],
      };

      vi.resetModules();
      const { proposeOrExecute: reloadedExecutor } = await import('../executor');

      const result = await reloadedExecutor(input);

      expect(result.results[0].status).toBe('STAGED');
      expect(result.results[0].note).toBe('blocked_pre_draft');
    });

    it('handles missing team key gracefully', async () => {
      vi.doMock('../../config/env', () => ({
        env: { EXECUTION_MODE: 'live' },
      }));

      const mockShouldAutoExecute = vi.fn().mockReturnValue(true);
      vi.doMock('../../guards/shouldExecute', () => ({
        shouldAutoExecute: mockShouldAutoExecute,
      }));

      const mockUserTeamKey = vi.fn().mockResolvedValue(null);
      vi.doMock('../../services/yahoo', () => ({
        yfForUser: vi.fn().mockResolvedValue(mockYahooClient),
        getGameKey: vi.fn().mockResolvedValue('431'),
        leagueKeyFor: vi.fn().mockReturnValue('431.l.123456'),
        userTeamKey: mockUserTeamKey,
        isLeaguePostDraft: vi.fn().mockResolvedValue(true),
        callYahoo: vi.fn().mockResolvedValue({ success: true, transactionId: 'trans_123' }),
      }));

      const input = {
        ...baseInput,
        actions: [
          {
            id: 'action1',
            type: 'WAIVER',
            summary: 'No team key action',
            confidence: 0.85,
            fabBid: 10,
            fabRemaining: 100,
          },
        ],
      };

      vi.resetModules();
      const { proposeOrExecute: reloadedExecutor } = await import('../executor');

      const result = await reloadedExecutor(input);

      expect(result.results[0].status).toBe('STAGED');
      expect(result.results[0].note).toBe('team_key_not_found');
    });

    it('handles Yahoo API execution failures', async () => {
      vi.doMock('../../config/env', () => ({
        env: { EXECUTION_MODE: 'live' },
      }));

      const mockShouldAutoExecute = vi.fn().mockReturnValue(true);
      vi.doMock('../../guards/shouldExecute', () => ({
        shouldAutoExecute: mockShouldAutoExecute,
      }));

      const mockCallYahoo = vi.fn().mockResolvedValue({
        success: false,
        reason: 'TRANSACTION_FAILED',
      });
      vi.doMock('../../services/yahoo', () => ({
        yfForUser: vi.fn().mockResolvedValue(mockYahooClient),
        getGameKey: vi.fn().mockResolvedValue('431'),
        leagueKeyFor: vi.fn().mockReturnValue('431.l.123456'),
        userTeamKey: vi.fn().mockResolvedValue('431.l.123456.t.1'),
        isLeaguePostDraft: vi.fn().mockResolvedValue(true),
        callYahoo: mockCallYahoo,
      }));

      const input = {
        ...baseInput,
        actions: [
          {
            id: 'action1',
            type: 'WAIVER',
            summary: 'Failed execution',
            confidence: 0.85,
            fabBid: 10,
            fabRemaining: 100,
          },
        ],
      };

      vi.resetModules();
      const { proposeOrExecute: reloadedExecutor } = await import('../executor');

      const result = await reloadedExecutor(input);

      expect(result.results[0].status).toBe('STAGED');
      expect(result.results[0].note).toBe('TRANSACTION_FAILED');
    });

    it('marks actions as DRY_RUN in dry-run mode', async () => {
      const mockShouldAutoExecute = vi.fn().mockReturnValue(true);
      vi.doMock('../../guards/shouldExecute', () => ({
        shouldAutoExecute: mockShouldAutoExecute,
      }));

      // Mock env to stay in dry-run mode (default)
      vi.doMock('../../config/env', () => ({
        env: {
          EXECUTION_MODE: 'dry-run',
        },
      }));

      vi.resetModules();
      const { proposeOrExecute } = await import('../executor');

      const input = {
        ...baseInput,
        actions: [
          {
            id: 'action1',
            type: 'WAIVER',
            summary: 'Dry run action',
            confidence: 0.85,
            fabBid: 10,
            fabRemaining: 100,
          },
        ],
      };

      const result = await proposeOrExecute(input);

      expect(result.results[0].status).toBe('DRY_RUN');
      expect(result.results[0].autoEligible).toBe(true);
    });

    it('processes multiple actions correctly', async () => {
      const mockShouldAutoExecute = vi
        .fn()
        .mockReturnValueOnce(false) // First action not auto-eligible
        .mockReturnValueOnce(true); // Second action auto-eligible
      vi.doMock('../../guards/shouldExecute', () => ({
        shouldAutoExecute: mockShouldAutoExecute,
      }));

      vi.resetModules();
      const { proposeOrExecute } = await import('../executor');

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
            fabRemaining: 100,
          },
          {
            id: 'action2',
            type: 'LINEUP_SWAP',
            summary: 'Auto-executable swap',
            confidence: 0.85,
            isInjuryOut: true,
          },
        ],
      };

      const result = await proposeOrExecute(input);

      expect(result.results).toHaveLength(2);
      expect(result.results[0].autoEligible).toBe(false);
      expect(result.results[1].autoEligible).toBe(true);
      expect(mockPrismaClient.recommendation.create).toHaveBeenCalledTimes(2);
    });

    it('handles execution errors gracefully', async () => {
      vi.doMock('../../config/env', () => ({
        env: { EXECUTION_MODE: 'live' },
      }));

      const mockShouldAutoExecute = vi.fn().mockReturnValue(true);
      vi.doMock('../../guards/shouldExecute', () => ({
        shouldAutoExecute: mockShouldAutoExecute,
      }));

      const mockCallYahoo = vi.fn().mockRejectedValue(new Error('Network error'));
      vi.doMock('../../services/yahoo', () => ({
        yfForUser: vi.fn().mockResolvedValue(mockYahooClient),
        getGameKey: vi.fn().mockResolvedValue('431'),
        leagueKeyFor: vi.fn().mockReturnValue('431.l.123456'),
        userTeamKey: vi.fn().mockResolvedValue('431.l.123456.t.1'),
        isLeaguePostDraft: vi.fn().mockResolvedValue(true),
        callYahoo: mockCallYahoo,
      }));

      const input = {
        ...baseInput,
        actions: [
          {
            id: 'action1',
            type: 'WAIVER',
            summary: 'Network error action',
            confidence: 0.85,
            fabBid: 10,
            fabRemaining: 100,
          },
        ],
      };

      vi.resetModules();
      const { proposeOrExecute: reloadedExecutor } = await import('../executor');

      const result = await reloadedExecutor(input);

      expect(result.results[0].status).toBe('STAGED');
      expect(result.results[0].error).toBe('Network error');
    });
  });
});
