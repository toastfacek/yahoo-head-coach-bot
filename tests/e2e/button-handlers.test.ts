import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MessageFlags } from 'discord.js';
import { handleInteraction } from '../../apps/discord-bot/src/handlers/interactions';
import { userService } from '../../apps/discord-bot/src/services/userService';
import { orchestratorApi } from '../../apps/discord-bot/src/services/orchestratorApi';
import { 
  createMockButtonInteraction,
  createMockUser 
} from '../mocks/discord.mock';
import { TEST_USERS } from '../setup';

// Mock the services
vi.mock('../../apps/discord-bot/src/services/userService');
vi.mock('../../apps/discord-bot/src/services/orchestratorApi');

const mockUserService = vi.mocked(userService);
const mockOrchestratorApi = vi.mocked(orchestratorApi);

describe('Button Handlers', () => {
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      commands: new Map() // No commands needed for button interactions
    };
    vi.clearAllMocks();
  });

  describe('auth:status Button Handler', () => {
    it('should handle auth status button with defer + editReply pattern', async () => {
      const mockInteraction = createMockButtonInteraction('auth:status', {
        user: createMockUser({ id: TEST_USERS.VALID_DISCORD_ID })
      });

      mockUserService.getUser.mockResolvedValue({
        id: TEST_USERS.VALID_DISCORD_ID,
        email: 'test@example.com',
        yahooUserId: 'yahoo-123',
        createdAt: new Date(),
        updatedAt: new Date()
      });
      mockUserService.isAuthenticated.mockResolvedValue(true);
      mockOrchestratorApi.checkOAuthStatus.mockResolvedValue({
        authenticated: true,
        userInfo: {
          name: 'Test User',
          expiresAt: new Date(Date.now() + 3600000).toISOString()
        }
      });

      await handleInteraction(mockClient, mockInteraction);

      expect(mockInteraction.deferReply).toHaveBeenCalledWith({
        flags: MessageFlags.Ephemeral
      });
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        embeds: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              title: 'Authentication Status',
              description: expect.stringContaining('✅ Connected to Yahoo Fantasy Football'),
              color: 0x00ff00 // Green for connected
            })
          })
        ])
      });
    });

    it('should show not connected status for unauthenticated user', async () => {
      const mockInteraction = createMockButtonInteraction('auth:status', {
        user: createMockUser({ id: TEST_USERS.VALID_DISCORD_ID })
      });

      mockUserService.getUser.mockResolvedValue(null);
      mockUserService.isAuthenticated.mockResolvedValue(false);

      await handleInteraction(mockClient, mockInteraction);

      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        embeds: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              description: expect.stringContaining('❌ Not connected'),
              color: 0xff0000 // Red for not connected
            })
          })
        ])
      });
    });

    it('should show expired status when OAuth tokens are invalid', async () => {
      const mockInteraction = createMockButtonInteraction('auth:status', {
        user: createMockUser({ id: TEST_USERS.VALID_DISCORD_ID })
      });

      mockUserService.getUser.mockResolvedValue({
        id: TEST_USERS.VALID_DISCORD_ID,
        email: 'test@example.com',
        yahooUserId: 'yahoo-123',
        createdAt: new Date(),
        updatedAt: new Date()
      });
      mockUserService.isAuthenticated.mockResolvedValue(true);
      mockOrchestratorApi.checkOAuthStatus.mockResolvedValue({
        authenticated: false // Tokens expired
      });

      await handleInteraction(mockClient, mockInteraction);

      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        embeds: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              description: expect.stringContaining('⚠️ Authentication expired'),
              color: 0xff9900 // Orange for expired
            })
          })
        ])
      });
    });

    it('should handle service errors gracefully', async () => {
      const mockInteraction = createMockButtonInteraction('auth:status', {
        user: createMockUser({ id: TEST_USERS.VALID_DISCORD_ID })
      });

      mockUserService.getUser.mockRejectedValue(new Error('Database error'));

      await handleInteraction(mockClient, mockInteraction);

      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        content: '❌ Failed to check authentication status.'
      });
    });

    it('should use ephemeral flags correctly', async () => {
      const mockInteraction = createMockButtonInteraction('auth:status', {
        user: createMockUser({ id: TEST_USERS.VALID_DISCORD_ID })
      });

      mockUserService.getUser.mockResolvedValue(null);
      mockUserService.isAuthenticated.mockResolvedValue(false);

      await handleInteraction(mockClient, mockInteraction);

      expect(mockInteraction.deferReply).toHaveBeenCalledWith({
        flags: MessageFlags.Ephemeral
      });
    });

    it('should not defer if interaction is already deferred', async () => {
      const mockInteraction = createMockButtonInteraction('auth:status', {
        user: createMockUser({ id: TEST_USERS.VALID_DISCORD_ID }),
        deferred: true
      });

      mockUserService.getUser.mockResolvedValue(null);
      mockUserService.isAuthenticated.mockResolvedValue(false);

      await handleInteraction(mockClient, mockInteraction);

      expect(mockInteraction.deferReply).not.toHaveBeenCalled();
      expect(mockInteraction.editReply).toHaveBeenCalled();
    });

    it('should not defer if interaction is already replied', async () => {
      const mockInteraction = createMockButtonInteraction('auth:status', {
        user: createMockUser({ id: TEST_USERS.VALID_DISCORD_ID }),
        replied: true
      });

      mockUserService.getUser.mockResolvedValue(null);
      mockUserService.isAuthenticated.mockResolvedValue(false);

      await handleInteraction(mockClient, mockInteraction);

      expect(mockInteraction.deferReply).not.toHaveBeenCalled();
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        embeds: expect.any(Array),
        flags: MessageFlags.Ephemeral
      });
    });
  });

  describe('Recommendation Button Handlers', () => {
    describe('approve button', () => {
      it('should approve recommendation when user is authenticated', async () => {
        const mockInteraction = createMockButtonInteraction('approve:rec-123', {
          user: createMockUser({ id: TEST_USERS.VALID_DISCORD_ID })
        });

        mockUserService.isAuthenticated.mockResolvedValue(true);
        mockUserService.getYahooUserId.mockResolvedValue('yahoo-user-123');
        mockOrchestratorApi.approveRecommendation.mockResolvedValue(true);

        await handleInteraction(mockClient, mockInteraction);

        expect(mockInteraction.deferReply).toHaveBeenCalledWith({
          flags: MessageFlags.Ephemeral
        });
        expect(mockOrchestratorApi.approveRecommendation).toHaveBeenCalledWith(
          'yahoo-user-123',
          'rec-123'
        );
        expect(mockInteraction.editReply).toHaveBeenCalledWith({
          content: '✅ Recommendation approved and executed!'
        });
      });

      it('should reject approval for unauthenticated user', async () => {
        const mockInteraction = createMockButtonInteraction('approve:rec-123', {
          user: createMockUser({ id: TEST_USERS.VALID_DISCORD_ID })
        });

        mockUserService.isAuthenticated.mockResolvedValue(false);

        await handleInteraction(mockClient, mockInteraction);

        expect(mockInteraction.reply).toHaveBeenCalledWith({
          content: '🔐 You need to be authenticated to approve recommendations.',
          flags: MessageFlags.Ephemeral
        });
        expect(mockOrchestratorApi.approveRecommendation).not.toHaveBeenCalled();
      });

      it('should handle approval API failures', async () => {
        const mockInteraction = createMockButtonInteraction('approve:rec-123', {
          user: createMockUser({ id: TEST_USERS.VALID_DISCORD_ID })
        });

        mockUserService.isAuthenticated.mockResolvedValue(true);
        mockUserService.getYahooUserId.mockResolvedValue('yahoo-user-123');
        mockOrchestratorApi.approveRecommendation.mockResolvedValue(false);

        await handleInteraction(mockClient, mockInteraction);

        expect(mockInteraction.editReply).toHaveBeenCalledWith({
          content: '❌ Failed to approve recommendation. It may have already been processed.'
        });
      });
    });

    describe('reject button', () => {
      it('should reject recommendation when user is authenticated', async () => {
        const mockInteraction = createMockButtonInteraction('reject:rec-456', {
          user: createMockUser({ id: TEST_USERS.VALID_DISCORD_ID })
        });

        mockUserService.isAuthenticated.mockResolvedValue(true);
        mockUserService.getYahooUserId.mockResolvedValue('yahoo-user-123');
        mockOrchestratorApi.rejectRecommendation.mockResolvedValue(true);

        await handleInteraction(mockClient, mockInteraction);

        expect(mockInteraction.deferReply).toHaveBeenCalledWith({
          flags: MessageFlags.Ephemeral
        });
        expect(mockOrchestratorApi.rejectRecommendation).toHaveBeenCalledWith(
          'yahoo-user-123',
          'rec-456'
        );
        expect(mockInteraction.editReply).toHaveBeenCalledWith({
          content: '❌ Recommendation rejected and will not be executed.'
        });
      });

      it('should reject rejection for unauthenticated user', async () => {
        const mockInteraction = createMockButtonInteraction('reject:rec-456', {
          user: createMockUser({ id: TEST_USERS.VALID_DISCORD_ID })
        });

        mockUserService.isAuthenticated.mockResolvedValue(false);

        await handleInteraction(mockClient, mockInteraction);

        expect(mockInteraction.reply).toHaveBeenCalledWith({
          content: '🔐 You need to be authenticated to reject recommendations.',
          flags: MessageFlags.Ephemeral
        });
      });
    });

    describe('details button', () => {
      it('should show recommendation details when user is authenticated', async () => {
        const mockInteraction = createMockButtonInteraction('details:rec-789', {
          user: createMockUser({ id: TEST_USERS.VALID_DISCORD_ID })
        });

        const mockRecommendation = {
          id: 'rec-789',
          type: 'LINEUP_SWAP',
          confidence: 0.85,
          created_at: new Date().toISOString(),
          reason: 'Player has better matchup this week',
          data: {
            in: { player_name: 'John Doe', position: 'WR' },
            out: { player_name: 'Jane Smith', position: 'WR' },
            projected_improvement: 3.5
          }
        };

        mockUserService.isAuthenticated.mockResolvedValue(true);
        mockUserService.getYahooUserId.mockResolvedValue('yahoo-user-123');
        mockOrchestratorApi.getUserLeagues.mockResolvedValue([
          { id: 'league-1', name: 'Test League' }
        ]);
        mockOrchestratorApi.getPendingApprovals.mockResolvedValue([mockRecommendation]);

        await handleInteraction(mockClient, mockInteraction);

        expect(mockInteraction.deferReply).toHaveBeenCalledWith({
          flags: MessageFlags.Ephemeral
        });
        expect(mockInteraction.editReply).toHaveBeenCalledWith({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              data: expect.objectContaining({
                title: '📋 Recommendation Details',
                description: expect.stringContaining('LINEUP_SWAP'),
                color: 0x430297
              })
            })
          ])
        });
      });

      it('should handle missing recommendation', async () => {
        const mockInteraction = createMockButtonInteraction('details:rec-missing', {
          user: createMockUser({ id: TEST_USERS.VALID_DISCORD_ID })
        });

        mockUserService.isAuthenticated.mockResolvedValue(true);
        mockUserService.getYahooUserId.mockResolvedValue('yahoo-user-123');
        mockOrchestratorApi.getUserLeagues.mockResolvedValue([
          { id: 'league-1', name: 'Test League' }
        ]);
        mockOrchestratorApi.getPendingApprovals.mockResolvedValue([]);

        await handleInteraction(mockClient, mockInteraction);

        expect(mockInteraction.editReply).toHaveBeenCalledWith({
          content: '❌ Recommendation not found. It may have already been processed.'
        });
      });
    });

    describe('refresh button', () => {
      it('should acknowledge refresh button', async () => {
        const mockInteraction = createMockButtonInteraction('refresh:lineup', {
          user: createMockUser({ id: TEST_USERS.VALID_DISCORD_ID })
        });

        await handleInteraction(mockClient, mockInteraction);

        expect(mockInteraction.reply).toHaveBeenCalledWith({
          content: '🔄 Refreshing lineup data...',
          ephemeral: true // This handler still uses deprecated ephemeral
        });
      });

      it('should handle different refresh types', async () => {
        const refreshTypes = ['lineup', 'waivers', 'reports'];
        
        for (const type of refreshTypes) {
          const mockInteraction = createMockButtonInteraction(`refresh:${type}`, {
            user: createMockUser({ id: TEST_USERS.VALID_DISCORD_ID })
          });

          await handleInteraction(mockClient, mockInteraction);

          expect(mockInteraction.reply).toHaveBeenCalledWith({
            content: `🔄 Refreshing ${type} data...`,
            ephemeral: true
          });
        }
      });
    });
  });

  describe('Unknown Button Handler', () => {
    it('should handle unknown button custom IDs', async () => {
      const mockInteraction = createMockButtonInteraction('unknown:action', {
        user: createMockUser({ id: TEST_USERS.VALID_DISCORD_ID })
      });

      await handleInteraction(mockClient, mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'Unknown button action.',
        flags: MessageFlags.Ephemeral
      });
    });

    it('should handle malformed button custom IDs', async () => {
      const mockInteraction = createMockButtonInteraction('malformed', {
        user: createMockUser({ id: TEST_USERS.VALID_DISCORD_ID })
      });

      await handleInteraction(mockClient, mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'Unknown button action.',
        flags: MessageFlags.Ephemeral
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle service unavailability gracefully', async () => {
      const mockInteraction = createMockButtonInteraction('auth:status', {
        user: createMockUser({ id: TEST_USERS.VALID_DISCORD_ID })
      });

      mockUserService.getUser.mockRejectedValue(new Error('Service unavailable'));

      await handleInteraction(mockClient, mockInteraction);

      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        content: '❌ Failed to check authentication status.'
      });
    });

    it('should handle network timeout errors', async () => {
      const mockInteraction = createMockButtonInteraction('approve:rec-123', {
        user: createMockUser({ id: TEST_USERS.VALID_DISCORD_ID })
      });

      mockUserService.isAuthenticated.mockResolvedValue(true);
      mockUserService.getYahooUserId.mockResolvedValue('yahoo-user-123');
      mockOrchestratorApi.approveRecommendation.mockRejectedValue(
        new Error('Request timeout')
      );

      await handleInteraction(mockClient, mockInteraction);

      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        content: '❌ An error occurred while approving the recommendation.'
      });
    });

    it('should handle missing Yahoo user ID', async () => {
      const mockInteraction = createMockButtonInteraction('approve:rec-123', {
        user: createMockUser({ id: TEST_USERS.VALID_DISCORD_ID })
      });

      mockUserService.isAuthenticated.mockResolvedValue(true);
      mockUserService.getYahooUserId.mockResolvedValue(null);

      await handleInteraction(mockClient, mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: '❌ Authentication error. Please re-authenticate.',
        flags: MessageFlags.Ephemeral
      });
    });
  });

  describe('Custom ID Parsing', () => {
    it('should correctly parse button custom IDs with parameters', async () => {
      const testCases = [
        { customId: 'approve:rec-123', action: 'approve', param: 'rec-123' },
        { customId: 'reject:rec-456', action: 'reject', param: 'rec-456' },
        { customId: 'details:rec-789', action: 'details', param: 'rec-789' },
        { customId: 'refresh:lineup', action: 'refresh', param: 'lineup' },
        { customId: 'auth:status', action: 'auth', param: 'status' }
      ];

      for (const testCase of testCases) {
        const mockInteraction = createMockButtonInteraction(testCase.customId, {
          user: createMockUser({ id: TEST_USERS.VALID_DISCORD_ID })
        });

        // Mock appropriate service responses based on action
        if (testCase.action === 'auth') {
          mockUserService.getUser.mockResolvedValue(null);
          mockUserService.isAuthenticated.mockResolvedValue(false);
        } else if (['approve', 'reject'].includes(testCase.action)) {
          mockUserService.isAuthenticated.mockResolvedValue(false); // Will trigger auth error
        }

        await handleInteraction(mockClient, mockInteraction);

        // Verify the interaction was handled (no errors thrown)
        expect(mockInteraction.reply || mockInteraction.deferReply).toHaveBeenCalled();
      }
    });

    it('should handle button IDs with multiple colons', async () => {
      const mockInteraction = createMockButtonInteraction('complex:action:param1:param2', {
        user: createMockUser({ id: TEST_USERS.VALID_DISCORD_ID })
      });

      await handleInteraction(mockClient, mockInteraction);

      // Should be treated as unknown action
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'Unknown button action.',
        flags: MessageFlags.Ephemeral
      });
    });

    it('should handle empty parameters gracefully', async () => {
      const mockInteraction = createMockButtonInteraction('approve:', {
        user: createMockUser({ id: TEST_USERS.VALID_DISCORD_ID })
      });

      mockUserService.isAuthenticated.mockResolvedValue(true);
      mockUserService.getYahooUserId.mockResolvedValue('yahoo-user-123');
      mockOrchestratorApi.approveRecommendation.mockResolvedValue(false);

      await handleInteraction(mockClient, mockInteraction);

      // Should still attempt to call the API with empty parameter
      expect(mockOrchestratorApi.approveRecommendation).toHaveBeenCalledWith(
        'yahoo-user-123',
        ''
      );
    });
  });
});