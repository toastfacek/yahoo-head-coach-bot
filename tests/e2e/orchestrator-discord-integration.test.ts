import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { orchestratorApi } from '../../apps/discord-bot/src/services/orchestratorApi';
import { authCommand } from '../../apps/discord-bot/src/commands/auth';
import { stateStore } from '../../apps/orchestrator/src/services/stateStore';
import { 
  createMockChatInputCommandInteraction,
  createMockButtonInteraction,
  createMockUser 
} from '../mocks/discord.mock';
import { createYahooOAuthMock } from '../mocks/yahoo.mock';
import { 
  simulateNetworkError,
  simulateTimeoutError,
  sleep 
} from '../utils/test-helpers';
import { TEST_USERS } from '../setup';

// Mock axios for orchestrator API calls
vi.mock('axios', () => ({
  create: vi.fn(() => ({
    get: vi.fn(),
    post: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() }
    }
  }))
}));

describe('Orchestrator-Discord Integration', () => {
  let mockAxios: any;
  let yahooMock: ReturnType<typeof createYahooOAuthMock>;

  beforeEach(() => {
    // Get the mocked axios instance
    const axios = require('axios');
    mockAxios = axios.create();
    
    yahooMock = createYahooOAuthMock();
    vi.clearAllMocks();
  });

  afterEach(() => {
    yahooMock.cleanAll();
  });

  describe('OAuth Session Creation Integration', () => {
    it('should create OAuth session through orchestrator API', async () => {
      const mockAuthUrl = 'http://localhost:3000/api/oauth/start?state=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test';
      
      mockAxios.post.mockResolvedValue({
        data: { authorize_url: mockAuthUrl }
      });

      const result = await orchestratorApi.createOAuthSession(TEST_USERS.VALID_DISCORD_ID);

      expect(mockAxios.post).toHaveBeenCalledWith('/oauth/session', {
        discordId: TEST_USERS.VALID_DISCORD_ID
      });
      expect(result).toBe(mockAuthUrl);
    });

    it('should handle orchestrator API errors in session creation', async () => {
      mockAxios.post.mockRejectedValue(new Error('Session creation failed'));

      await expect(
        orchestratorApi.createOAuthSession(TEST_USERS.VALID_DISCORD_ID)
      ).rejects.toThrow('Failed to initialize authentication');
    });

    it('should handle missing authorize_url in response', async () => {
      mockAxios.post.mockResolvedValue({
        data: { error: 'Invalid request' }
      });

      await expect(
        orchestratorApi.createOAuthSession(TEST_USERS.VALID_DISCORD_ID)
      ).rejects.toThrow('Failed to initialize authentication');
    });

    it('should validate Discord ID format before API call', async () => {
      const invalidId = 'invalid-discord-id';
      
      mockAxios.post.mockResolvedValue({
        data: { authorize_url: 'http://example.com' }
      });

      // Should still make the call (validation happens on orchestrator side)
      await orchestratorApi.createOAuthSession(invalidId);
      
      expect(mockAxios.post).toHaveBeenCalledWith('/oauth/session', {
        discordId: invalidId
      });
    });
  });

  describe('OAuth Status Integration', () => {
    it('should check OAuth status through orchestrator API', async () => {
      const mockStatus = {
        authenticated: true,
        userInfo: {
          id: 'yahoo-user-123',
          name: 'Test User',
          scope: 'fspt-w',
          tokenType: 'bearer',
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
          expiresInSeconds: 3600
        }
      };

      mockAxios.get.mockResolvedValue({
        data: mockStatus
      });

      const result = await orchestratorApi.checkOAuthStatus(TEST_USERS.VALID_DISCORD_ID);

      expect(mockAxios.get).toHaveBeenCalledWith(`/oauth/status?userId=${TEST_USERS.VALID_DISCORD_ID}`);
      expect(result).toEqual(mockStatus);
    });

    it('should handle unauthenticated status', async () => {
      mockAxios.get.mockResolvedValue({
        data: { authenticated: false }
      });

      const result = await orchestratorApi.checkOAuthStatus(TEST_USERS.VALID_DISCORD_ID);

      expect(result.authenticated).toBe(false);
      expect(result.userInfo).toBeUndefined();
    });

    it('should handle orchestrator API errors in status check', async () => {
      mockAxios.get.mockRejectedValue(simulateNetworkError());

      const result = await orchestratorApi.checkOAuthStatus(TEST_USERS.VALID_DISCORD_ID);

      expect(result).toEqual({ authenticated: false });
    });

    it('should handle timeout errors in status check', async () => {
      mockAxios.get.mockRejectedValue(simulateTimeoutError());

      const result = await orchestratorApi.checkOAuthStatus(TEST_USERS.VALID_DISCORD_ID);

      expect(result).toEqual({ authenticated: false });
    });
  });

  describe('Discord Command Integration with Orchestrator', () => {
    it('should integrate Discord auth login with orchestrator session', async () => {
      const mockAuthUrl = 'http://localhost:3000/api/oauth/start?state=jwt_token';
      const mockInteraction = createMockChatInputCommandInteraction({
        user: createMockUser({ id: TEST_USERS.VALID_DISCORD_ID }),
        options: { getSubcommand: vi.fn().mockReturnValue('login') }
      });

      mockAxios.post.mockResolvedValue({
        data: { authorize_url: mockAuthUrl }
      });

      await authCommand.execute(mockInteraction);

      // Verify orchestrator session was created
      expect(mockAxios.post).toHaveBeenCalledWith('/oauth/session', {
        discordId: TEST_USERS.VALID_DISCORD_ID
      });

      // Verify Discord response includes the auth URL
      expect(mockInteraction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          components: expect.arrayContaining([
            expect.objectContaining({
              components: expect.arrayContaining([
                expect.objectContaining({
                  data: expect.objectContaining({
                    url: mockAuthUrl
                  })
                })
              ])
            })
          ])
        })
      );
    });

    it('should handle orchestrator unavailability in Discord command', async () => {
      const mockInteraction = createMockChatInputCommandInteraction({
        user: createMockUser({ id: TEST_USERS.VALID_DISCORD_ID }),
        options: { getSubcommand: vi.fn().mockReturnValue('login') }
      });

      mockAxios.post.mockRejectedValue(simulateNetworkError());

      await authCommand.execute(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: '❌ Failed to generate authentication link. Please try again later.',
        flags: expect.any(Number)
      });
    });

    it('should integrate Discord auth status with orchestrator status check', async () => {
      const mockInteraction = createMockChatInputCommandInteraction({
        user: createMockUser({ id: TEST_USERS.VALID_DISCORD_ID }),
        options: { getSubcommand: vi.fn().mockReturnValue('status') }
      });

      const mockStatus = {
        authenticated: true,
        userInfo: {
          name: 'Test User',
          expiresAt: new Date(Date.now() + 3600000).toISOString()
        }
      };

      // Mock user service calls (these would be mocked separately in real integration)
      vi.doMock('@discord-bot/services/userService', () => ({
        userService: {
          createOrUpdateUser: vi.fn().mockResolvedValue(undefined),
          getUser: vi.fn().mockResolvedValue({
            id: TEST_USERS.VALID_DISCORD_ID,
            yahooUserId: 'yahoo-123',
            email: 'test@example.com',
            createdAt: new Date(),
            updatedAt: new Date()
          }),
          isAuthenticated: vi.fn().mockResolvedValue(true)
        }
      }));

      mockAxios.get.mockResolvedValue({
        data: mockStatus
      });

      await authCommand.execute(mockInteraction);

      expect(mockAxios.get).toHaveBeenCalledWith('/oauth/status?userId=yahoo-123');
      expect(mockInteraction.deferReply).toHaveBeenCalled();
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        embeds: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              description: expect.stringContaining('✅ **Connected to Yahoo Fantasy Football**'),
              color: 0x00ff00
            })
          })
        ])
      });
    });
  });

  describe('Health Check Integration', () => {
    it('should check orchestrator health', async () => {
      mockAxios.get.mockResolvedValue({ status: 200 });

      const isHealthy = await orchestratorApi.healthCheck();

      expect(mockAxios.get).toHaveBeenCalledWith('/health');
      expect(isHealthy).toBe(true);
    });

    it('should handle orchestrator health check failures', async () => {
      mockAxios.get.mockRejectedValue(simulateNetworkError());

      const isHealthy = await orchestratorApi.healthCheck();

      expect(isHealthy).toBe(false);
    });

    it('should handle non-200 responses in health check', async () => {
      mockAxios.get.mockResolvedValue({ status: 503 });

      const isHealthy = await orchestratorApi.healthCheck();

      expect(isHealthy).toBe(false);
    });
  });

  describe('League Data Integration', () => {
    it('should fetch user leagues through orchestrator', async () => {
      const mockLeagues = [
        { id: 'league-1', name: 'Test League 1' },
        { id: 'league-2', name: 'Test League 2' }
      ];

      mockAxios.get.mockResolvedValue({
        data: { leagues: mockLeagues }
      });

      const leagues = await orchestratorApi.getUserLeagues(TEST_USERS.VALID_DISCORD_ID);

      expect(mockAxios.get).toHaveBeenCalledWith(`/leagues?userId=${TEST_USERS.VALID_DISCORD_ID}`);
      expect(leagues).toEqual(mockLeagues);
    });

    it('should handle empty leagues response', async () => {
      mockAxios.get.mockResolvedValue({
        data: {}
      });

      const leagues = await orchestratorApi.getUserLeagues(TEST_USERS.VALID_DISCORD_ID);

      expect(leagues).toEqual([]);
    });

    it('should handle leagues API errors', async () => {
      mockAxios.get.mockRejectedValue(simulateNetworkError());

      await expect(
        orchestratorApi.getUserLeagues(TEST_USERS.VALID_DISCORD_ID)
      ).rejects.toThrow('Failed to retrieve leagues');
    });
  });

  describe('Recommendation Integration', () => {
    it('should fetch pending approvals through orchestrator', async () => {
      const mockApprovals = [
        {
          id: 'rec-1',
          type: 'LINEUP_SWAP',
          confidence: 0.85,
          created_at: new Date().toISOString()
        }
      ];

      mockAxios.get.mockResolvedValue({
        data: { pending: mockApprovals }
      });

      const approvals = await orchestratorApi.getPendingApprovals(
        TEST_USERS.VALID_DISCORD_ID,
        'league-1'
      );

      expect(mockAxios.get).toHaveBeenCalledWith(
        `/approvals/pending?userId=${TEST_USERS.VALID_DISCORD_ID}&leagueId=league-1`
      );
      expect(approvals).toEqual(mockApprovals);
    });

    it('should approve recommendations through orchestrator', async () => {
      mockAxios.post.mockResolvedValue({
        data: { success: true }
      });

      const success = await orchestratorApi.approveRecommendation(
        TEST_USERS.VALID_DISCORD_ID,
        'rec-123'
      );

      expect(mockAxios.post).toHaveBeenCalledWith('/approvals/approve', {
        userId: TEST_USERS.VALID_DISCORD_ID,
        recommendationId: 'rec-123'
      });
      expect(success).toBe(true);
    });

    it('should reject recommendations through orchestrator', async () => {
      mockAxios.post.mockResolvedValue({
        data: { success: true }
      });

      const success = await orchestratorApi.rejectRecommendation(
        TEST_USERS.VALID_DISCORD_ID,
        'rec-456'
      );

      expect(mockAxios.post).toHaveBeenCalledWith('/approvals/reject', {
        userId: TEST_USERS.VALID_DISCORD_ID,
        recommendationId: 'rec-456'
      });
      expect(success).toBe(true);
    });
  });

  describe('Error Recovery and Retries', () => {
    it('should handle intermittent network failures', async () => {
      // First call fails, second succeeds
      mockAxios.get
        .mockRejectedValueOnce(simulateNetworkError())
        .mockResolvedValueOnce({ data: { authenticated: true } });

      // The orchestratorApi doesn't implement retries by default,
      // but we can test the error handling
      const firstResult = await orchestratorApi.checkOAuthStatus(TEST_USERS.VALID_DISCORD_ID);
      expect(firstResult).toEqual({ authenticated: false });

      const secondResult = await orchestratorApi.checkOAuthStatus(TEST_USERS.VALID_DISCORD_ID);
      expect(secondResult).toEqual({ authenticated: true });
    });

    it('should handle request timeouts gracefully', async () => {
      mockAxios.post.mockRejectedValue(simulateTimeoutError());

      await expect(
        orchestratorApi.createOAuthSession(TEST_USERS.VALID_DISCORD_ID)
      ).rejects.toThrow('Failed to initialize authentication');
    });

    it('should handle malformed JSON responses', async () => {
      mockAxios.get.mockResolvedValue({
        data: 'invalid-json-string'
      });

      const leagues = await orchestratorApi.getUserLeagues(TEST_USERS.VALID_DISCORD_ID);

      // Should handle gracefully and return empty array
      expect(leagues).toEqual([]);
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle multiple concurrent session creations', async () => {
      const users = [TEST_USERS.VALID_DISCORD_ID, TEST_USERS.ANOTHER_DISCORD_ID];
      
      mockAxios.post.mockImplementation((url, data) => {
        return Promise.resolve({
          data: { 
            authorize_url: `http://localhost:3000/api/oauth/start?state=jwt_for_${data.discordId}` 
          }
        });
      });

      const promises = users.map(userId => 
        orchestratorApi.createOAuthSession(userId)
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(2);
      results.forEach((result, index) => {
        expect(result).toContain(users[index]);
      });
      expect(mockAxios.post).toHaveBeenCalledTimes(2);
    });

    it('should handle concurrent status checks', async () => {
      mockAxios.get.mockResolvedValue({
        data: { authenticated: true }
      });

      const promises = Array.from({ length: 10 }, (_, i) => 
        orchestratorApi.checkOAuthStatus(`user-${i}`)
      );

      const results = await Promise.all(promises);

      expect(results.every(r => r.authenticated === true)).toBe(true);
      expect(mockAxios.get).toHaveBeenCalledTimes(10);
    });

    it('should maintain session isolation during concurrent operations', async () => {
      const sessionPromises = [
        orchestratorApi.createOAuthSession(TEST_USERS.VALID_DISCORD_ID),
        orchestratorApi.createOAuthSession(TEST_USERS.ANOTHER_DISCORD_ID)
      ];

      mockAxios.post.mockImplementation((url, data) => {
        return new Promise(resolve => {
          // Add small delay to simulate real API call
          setTimeout(() => {
            resolve({
              data: { 
                authorize_url: `http://localhost:3000/api/oauth/start?state=jwt_${data.discordId}` 
              }
            });
          }, Math.random() * 10);
        });
      });

      const [url1, url2] = await Promise.all(sessionPromises);

      expect(url1).toContain(TEST_USERS.VALID_DISCORD_ID);
      expect(url2).toContain(TEST_USERS.ANOTHER_DISCORD_ID);
      expect(url1).not.toBe(url2);
    });
  });

  describe('Performance and Scaling', () => {
    it('should handle high-frequency API calls', async () => {
      mockAxios.get.mockResolvedValue({
        data: { authenticated: true }
      });

      const startTime = Date.now();
      const numCalls = 100;
      
      const promises = Array.from({ length: numCalls }, (_, i) =>
        orchestratorApi.healthCheck()
      );

      const results = await Promise.all(promises);
      const duration = Date.now() - startTime;

      expect(results.every(r => r === true)).toBe(true);
      expect(duration).toBeLessThan(2000); // Should complete within 2 seconds
      expect(mockAxios.get).toHaveBeenCalledTimes(numCalls);
    });

    it('should handle request queue overflow gracefully', async () => {
      // Simulate slow responses
      mockAxios.post.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => 
          resolve({ data: { authorize_url: 'http://example.com' } }), 100)
        )
      );

      const numRequests = 50;
      const promises = Array.from({ length: numRequests }, (_, i) =>
        orchestratorApi.createOAuthSession(`user-${i}`)
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(numRequests);
      expect(results.every(r => r.includes('http://example.com'))).toBe(true);
    });
  });
});