import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MessageFlags } from 'discord.js';
import { authCommand } from '../../apps/discord-bot/src/commands/auth';
import { orchestratorApi } from '../../apps/discord-bot/src/services/orchestratorApi';
import { userService } from '../../apps/discord-bot/src/services/userService';
import { 
  createMockChatInputCommandInteraction,
  createMockUser,
  DISCORD_ERRORS
} from '../mocks/discord.mock';
import { TEST_USERS, mockPrisma } from '../setup';

// Mock the services
vi.mock('../../apps/discord-bot/src/services/orchestratorApi');
vi.mock('../../apps/discord-bot/src/services/userService');

const mockOrchestratorApi = vi.mocked(orchestratorApi);
const mockUserService = vi.mocked(userService);

describe('Discord Commands', () => {
  let mockInteraction: any;

  beforeEach(() => {
    mockInteraction = createMockChatInputCommandInteraction();
    vi.clearAllMocks();
    
    // Re-setup default mocks that might have been cleared
    mockOrchestratorApi.createOAuthSession = vi.fn();
    mockUserService.createOrUpdateUser = vi.fn();
    mockUserService.getUser = vi.fn();
    mockUserService.unlinkYahooAccount = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('/auth login command', () => {
    beforeEach(() => {
      mockInteraction.options.getSubcommand.mockReturnValue('login');
    });

    it('should reply immediately with OAuth session link for new user', async () => {
      const mockAuthUrl = 'http://localhost:3000/api/oauth/start?state=jwt_token_here';
      
      mockOrchestratorApi.createOAuthSession.mockResolvedValue(mockAuthUrl);
      mockUserService.createOrUpdateUser.mockResolvedValue(undefined);

      await authCommand.execute(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        embeds: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              title: 'Connect Yahoo Fantasy Football',
              description: expect.stringContaining('Authorize the bot'),
              color: 0x430297
            })
          })
        ]),
        components: expect.arrayContaining([
          expect.objectContaining({
            components: expect.arrayContaining([
              expect.objectContaining({
                data: expect.objectContaining({
                  label: 'Authorize with Yahoo',
                  style: 5, // Link button
                  url: mockAuthUrl
                })
              }),
              expect.objectContaining({
                data: expect.objectContaining({
                  label: 'Check Status',
                  style: 2, // Secondary button
                  custom_id: 'auth:status'
                })
              })
            ])
          })
        ]),
        flags: MessageFlags.Ephemeral
      });
    });

    it('should use ephemeral flags instead of deprecated ephemeral property', async () => {
      const mockAuthUrl = 'http://localhost:3000/api/oauth/start?state=jwt_token_here';
      mockOrchestratorApi.createOAuthSession.mockResolvedValue(mockAuthUrl);

      await authCommand.execute(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          flags: MessageFlags.Ephemeral
        })
      );
      
      // Ensure no deprecated ephemeral property is used
      expect(mockInteraction.reply).not.toHaveBeenCalledWith(
        expect.objectContaining({
          ephemeral: expect.anything()
        })
      );
    });

    it('should handle orchestrator API failures gracefully', async () => {
      mockOrchestratorApi.createOAuthSession.mockRejectedValue(
        new Error('Failed to create OAuth session')
      );

      await authCommand.execute(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: '❌ Failed to generate authentication link. Please try again later.',
        flags: MessageFlags.Ephemeral
      });
    });

    it('should not call defer on login command (one-shot reply)', async () => {
      const mockAuthUrl = 'http://localhost:3000/api/oauth/start?state=jwt_token_here';
      mockOrchestratorApi.createOAuthSession.mockResolvedValue(mockAuthUrl);
      mockUserService.createOrUpdateUser.mockResolvedValue(undefined);

      await authCommand.execute(mockInteraction);

      expect(mockInteraction.deferReply).not.toHaveBeenCalled();
      expect(mockInteraction.reply).toHaveBeenCalledTimes(1);
    });

    it('should run user sync in background without blocking reply', async () => {
      const mockAuthUrl = 'http://localhost:3000/api/oauth/start?state=jwt_token_here';
      mockOrchestratorApi.createOAuthSession.mockResolvedValue(mockAuthUrl);
      
      // Make user service slow to ensure it doesn't block the reply
      mockUserService.createOrUpdateUser.mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 100))
      );

      const startTime = Date.now();
      await authCommand.execute(mockInteraction);
      const replyTime = Date.now() - startTime;

      expect(replyTime).toBeLessThan(50); // Reply should be fast
      expect(mockInteraction.reply).toHaveBeenCalled();
    });

    it('should handle interaction already replied error', async () => {
      mockInteraction.reply.mockRejectedValue(DISCORD_ERRORS.ALREADY_ACKNOWLEDGED());

      await authCommand.execute(mockInteraction);

      // Should not crash and should handle the error
      expect(mockInteraction.reply).toHaveBeenCalled();
    });

    it('should handle unknown interaction error', async () => {
      mockInteraction.reply.mockRejectedValue(DISCORD_ERRORS.UNKNOWN_INTERACTION());

      await authCommand.execute(mockInteraction);

      // Should not crash and should handle the error
      expect(mockInteraction.reply).toHaveBeenCalled();
    });
  });

  describe('/auth status command', () => {
    beforeEach(() => {
      mockInteraction.options.getSubcommand.mockReturnValue('status');
    });

    it('should use defer + editReply pattern for status check', async () => {
      mockUserService.createOrUpdateUser.mockResolvedValue(undefined);
      mockUserService.getUser.mockResolvedValue({
        id: TEST_USERS.VALID_DISCORD_ID,
        email: 'test@example.com',
        yahooUserId: 'yahoo-user-123',
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

      await authCommand.execute(mockInteraction);

      expect(mockInteraction.deferReply).toHaveBeenCalledWith({
        flags: MessageFlags.Ephemeral
      });
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        embeds: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              title: '🔐 Authentication Status',
              color: 0x00ff00 // Green for connected
            })
          })
        ])
      });
    });

    it('should show not connected status for unauthenticated user', async () => {
      mockUserService.createOrUpdateUser.mockResolvedValue(undefined);
      mockUserService.getUser.mockResolvedValue(null);
      mockUserService.isAuthenticated.mockResolvedValue(false);

      await authCommand.execute(mockInteraction);

      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        embeds: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              title: '🔐 Authentication Status',
              description: expect.stringContaining('❌ **Not Connected**'),
              color: 0xff0000 // Red for not connected
            })
          })
        ])
      });
    });

    it('should show expired status and unlink account when tokens are expired', async () => {
      mockUserService.createOrUpdateUser.mockResolvedValue(undefined);
      mockUserService.getUser.mockResolvedValue({
        id: TEST_USERS.VALID_DISCORD_ID,
        email: 'test@example.com',
        yahooUserId: 'yahoo-user-123',
        createdAt: new Date(),
        updatedAt: new Date()
      });
      mockUserService.isAuthenticated.mockResolvedValue(true);
      mockOrchestratorApi.checkOAuthStatus.mockResolvedValue({
        authenticated: false // Tokens expired
      });
      mockUserService.unlinkYahooAccount.mockResolvedValue(undefined);

      await authCommand.execute(mockInteraction);

      expect(mockUserService.unlinkYahooAccount).toHaveBeenCalledWith(TEST_USERS.VALID_DISCORD_ID);
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        embeds: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              description: expect.stringContaining('⚠️ **Authentication Expired**'),
              color: 0xff9900 // Orange for expired
            })
          })
        ])
      });
    });

    it('should handle user service failures gracefully', async () => {
      mockUserService.createOrUpdateUser.mockRejectedValue(
        new Error('Database connection failed')
      );

      await authCommand.execute(mockInteraction);

      // Should still defer and then handle the error
      expect(mockInteraction.deferReply).toHaveBeenCalled();
      
      // Error should be caught by main handler and show generic error
      // (exact behavior depends on error handling implementation)
    });
  });

  describe('/auth logout command', () => {
    beforeEach(() => {
      mockInteraction.options.getSubcommand.mockReturnValue('logout');
    });

    it('should use defer + editReply pattern for logout', async () => {
      mockUserService.createOrUpdateUser.mockResolvedValue(undefined);
      mockUserService.isAuthenticated.mockResolvedValue(true);
      mockUserService.unlinkYahooAccount.mockResolvedValue(undefined);

      await authCommand.execute(mockInteraction);

      expect(mockInteraction.deferReply).toHaveBeenCalledWith({
        flags: MessageFlags.Ephemeral
      });
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        embeds: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              title: '🔓 Account Disconnected',
              description: expect.stringContaining('✅ Your Yahoo Fantasy Football account has been disconnected'),
              color: 0x808080 // Gray for disconnected
            })
          })
        ])
      });
    });

    it('should inform user if not authenticated', async () => {
      mockUserService.createOrUpdateUser.mockResolvedValue(undefined);
      mockUserService.isAuthenticated.mockResolvedValue(false);

      await authCommand.execute(mockInteraction);

      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        content: 'ℹ️ You are not currently authenticated with Yahoo Fantasy Football.'
      });
      expect(mockUserService.unlinkYahooAccount).not.toHaveBeenCalled();
    });

    it('should successfully unlink authenticated user', async () => {
      mockUserService.createOrUpdateUser.mockResolvedValue(undefined);
      mockUserService.isAuthenticated.mockResolvedValue(true);
      mockUserService.unlinkYahooAccount.mockResolvedValue(undefined);

      await authCommand.execute(mockInteraction);

      expect(mockUserService.unlinkYahooAccount).toHaveBeenCalledWith(TEST_USERS.VALID_DISCORD_ID);
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        embeds: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              title: '🔓 Account Disconnected'
            })
          })
        ])
      });
    });
  });

  describe('Command Error Handling', () => {
    it('should handle unknown subcommand', async () => {
      mockInteraction.options.getSubcommand.mockReturnValue('unknown');

      await authCommand.execute(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'Unknown auth command. Use `/auth login`, `/auth status`, or `/auth logout`.',
        flags: MessageFlags.Ephemeral
      });
    });

    it('should catch and handle execution errors', async () => {
      mockInteraction.options.getSubcommand.mockReturnValue('login');
      mockOrchestratorApi.createOAuthSession.mockRejectedValue(
        new Error('Unexpected error')
      );

      // The command should not throw, but handle the error internally
      await expect(authCommand.execute(mockInteraction)).resolves.not.toThrow();
    });

    it('should use appropriate response method based on interaction state', async () => {
      mockInteraction.options.getSubcommand.mockReturnValue('status');
      mockInteraction.deferred = true; // Simulate already deferred interaction

      mockUserService.createOrUpdateUser.mockResolvedValue(undefined);
      mockUserService.getUser.mockResolvedValue(null);
      mockUserService.isAuthenticated.mockResolvedValue(false);

      await authCommand.execute(mockInteraction);

      // Should use editReply since interaction is deferred
      expect(mockInteraction.editReply).toHaveBeenCalled();
      expect(mockInteraction.reply).not.toHaveBeenCalled();
    });
  });

  describe('Interaction State Management', () => {
    it('should check interaction state before responding', async () => {
      mockInteraction.options.getSubcommand.mockReturnValue('login');
      mockInteraction.replied = true; // Simulate already replied interaction

      const mockAuthUrl = 'http://localhost:3000/api/oauth/start?state=jwt_token_here';
      mockOrchestratorApi.createOAuthSession.mockResolvedValue(mockAuthUrl);

      await authCommand.execute(mockInteraction);

      // Should use followUp since interaction was already replied to
      expect(mockInteraction.followUp).toHaveBeenCalledWith({
        embeds: expect.any(Array),
        components: expect.any(Array),
        flags: MessageFlags.Ephemeral
      });
      expect(mockInteraction.reply).not.toHaveBeenCalled();
    });

    it('should handle deferred interactions correctly', async () => {
      mockInteraction.options.getSubcommand.mockReturnValue('login');
      mockInteraction.deferred = true; // Simulate deferred interaction

      const mockAuthUrl = 'http://localhost:3000/api/oauth/start?state=jwt_token_here';
      mockOrchestratorApi.createOAuthSession.mockResolvedValue(mockAuthUrl);

      await authCommand.execute(mockInteraction);

      // Should use editReply since interaction is deferred
      expect(mockInteraction.editReply).toHaveBeenCalled();
      expect(mockInteraction.reply).not.toHaveBeenCalled();
      expect(mockInteraction.followUp).not.toHaveBeenCalled();
    });

    it('should prioritize reply over followUp for fresh interactions', async () => {
      mockInteraction.options.getSubcommand.mockReturnValue('login');
      mockInteraction.replied = false;
      mockInteraction.deferred = false;

      const mockAuthUrl = 'http://localhost:3000/api/oauth/start?state=jwt_token_here';
      mockOrchestratorApi.createOAuthSession.mockResolvedValue(mockAuthUrl);

      await authCommand.execute(mockInteraction);

      // Should use reply for fresh interactions
      expect(mockInteraction.reply).toHaveBeenCalled();
      expect(mockInteraction.editReply).not.toHaveBeenCalled();
      expect(mockInteraction.followUp).not.toHaveBeenCalled();
    });
  });

  describe('Message Formatting', () => {
    it('should create properly formatted embed for login', async () => {
      mockInteraction.options.getSubcommand.mockReturnValue('login');
      const mockAuthUrl = 'http://localhost:3000/api/oauth/start?state=jwt_token_here';
      mockOrchestratorApi.createOAuthSession.mockResolvedValue(mockAuthUrl);

      await authCommand.execute(mockInteraction);

      const replyCall = mockInteraction.reply.mock.calls[0][0];
      const embed = replyCall.embeds[0];
      
      expect(embed.data.title).toBe('Connect Yahoo Fantasy Football');
      expect(embed.data.description).toContain('Authorize the bot');
      expect(embed.data.color).toBe(0x430297);
    });

    it('should create action row with correct button components', async () => {
      mockInteraction.options.getSubcommand.mockReturnValue('login');
      const mockAuthUrl = 'http://localhost:3000/api/oauth/start?state=jwt_token_here';
      mockOrchestratorApi.createOAuthSession.mockResolvedValue(mockAuthUrl);

      await authCommand.execute(mockInteraction);

      const replyCall = mockInteraction.reply.mock.calls[0][0];
      const actionRow = replyCall.components[0];
      
      expect(actionRow.components).toHaveLength(2);
      
      const authButton = actionRow.components[0];
      expect(authButton.data.label).toBe('Authorize with Yahoo');
      expect(authButton.data.style).toBe(5); // Link style
      expect(authButton.data.url).toBe(mockAuthUrl);
      
      const statusButton = actionRow.components[1];
      expect(statusButton.data.label).toBe('Check Status');
      expect(statusButton.data.style).toBe(2); // Secondary style
      expect(statusButton.data.custom_id).toBe('auth:status');
    });
  });
});