import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createOAuthSession } from '../../apps/orchestrator/src/routes/oauth-session';
import { oauthStart, oauthCallback } from '../../apps/orchestrator/src/routes/oauth';
import { stateStore } from '../../apps/orchestrator/src/services/stateStore';
import { authCommand } from '../../apps/discord-bot/src/commands/auth';
import { orchestratorApi } from '../../apps/discord-bot/src/services/orchestratorApi';
import { userService } from '../../apps/discord-bot/src/services/userService';
import { 
  createMockChatInputCommandInteraction,
  createMockUser 
} from '../mocks/discord.mock';
import { 
  createYahooOAuthMock,
  createMockTokenResponse 
} from '../mocks/yahoo.mock';
import { verifyJWT } from '../../apps/orchestrator/src/utils/jwt';
import { 
  sleep, 
  waitFor, 
  expectValidJWT,
  expectOAuthRedirectURL 
} from '../utils/test-helpers';
import { TEST_USERS, TEST_TOKENS, mockPrisma } from '../setup';

// Mock services for integration
vi.mock('../../apps/discord-bot/src/services/userService');
vi.mock('axios');

const mockUserService = vi.mocked(userService);

describe('End-to-End OAuth Flow', () => {
  let app: express.Application;
  let yahooMock: ReturnType<typeof createYahooOAuthMock>;

  beforeEach(async () => {
    // Set up Express app for testing orchestrator endpoints
    app = express();
    app.use(express.json());
    app.post('/api/oauth/session', createOAuthSession);
    app.get('/api/oauth/start', oauthStart);
    app.get('/api/oauth/callback', oauthCallback);

    // Set up Yahoo API mocks
    yahooMock = createYahooOAuthMock();

    // Mock Prisma operations
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.create.mockResolvedValue({
      id: TEST_USERS.VALID_DISCORD_ID,
      email: `${TEST_USERS.VALID_DISCORD_ID}@example.com`,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    mockPrisma.yahooToken.upsert.mockResolvedValue({} as any);
    mockPrisma.discordUser.findUnique.mockResolvedValue(null);
    mockPrisma.discordUser.create.mockResolvedValue({} as any);

    vi.clearAllMocks();
  });

  afterEach(async () => {
    yahooMock.cleanAll();
    await stateStore.cleanAll?.() ?? Promise.resolve();
  });

  describe('Complete User Journey', () => {
    it('should complete full OAuth flow from Discord command to callback', async () => {
      // Mock Discord interaction
      const mockInteraction = createMockChatInputCommandInteraction({
        user: createMockUser({ id: TEST_USERS.VALID_DISCORD_ID }),
        options: { getSubcommand: vi.fn().mockReturnValue('login') }
      });

      // Step 1: User runs /auth login command
      await authCommand.execute(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              data: expect.objectContaining({
                title: 'Connect Yahoo Fantasy Football'
              })
            })
          ]),
          components: expect.any(Array)
        })
      );

      // Extract the auth URL from the button
      const replyCall = mockInteraction.reply.mock.calls[0][0];
      const button = replyCall.components[0].components[0];
      const authUrl = button.data.url;

      expect(authUrl).toMatch(/^http:\/\/localhost:3000\/api\/oauth\/start\?state=/);

      // Step 2: Extract state from auth URL and validate JWT
      const url = new URL(authUrl);
      const state = url.searchParams.get('state');
      expect(state).toBeTruthy();

      const payload = expectValidJWT(state!, TEST_TOKENS.VALID_JWT_SECRET);
      expect(payload.sub).toBe(TEST_USERS.VALID_DISCORD_ID);
      expect(payload.purpose).toBe('yahoo_oauth');

      // Step 3: Simulate user clicking auth URL (oauth/start endpoint)
      yahooMock.mockTokenExchange(createMockTokenResponse());

      const startResponse = await request(app)
        .get(`/api/oauth/start?state=${encodeURIComponent(state!)}`)
        .expect(302);

      const redirectLocation = startResponse.headers.location;
      expectOAuthRedirectURL(redirectLocation);

      // Step 4: Simulate Yahoo redirect back to callback
      const callbackUrl = new URL(redirectLocation);
      const yahooState = callbackUrl.searchParams.get('state');
      expect(yahooState).toBe(state);

      const callbackResponse = await request(app)
        .get(`/api/oauth/callback?code=test_auth_code&state=${encodeURIComponent(yahooState!)}`)
        .expect(200);

      expect(callbackResponse.text).toContain('Yahoo Authentication Complete!');
      expect(callbackResponse.text).toContain(TEST_USERS.VALID_DISCORD_ID);

      // Step 5: Verify state was consumed (prevent replay attacks)
      const remainingState = await stateStore.get(payload.jti!);
      expect(remainingState).toBeNull();

      // Step 6: Verify database records were created
      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: {
          id: TEST_USERS.VALID_DISCORD_ID,
          email: `${TEST_USERS.VALID_DISCORD_ID}@example.com`
        }
      });

      expect(mockPrisma.yahooToken.upsert).toHaveBeenCalledWith({
        where: { userId: TEST_USERS.VALID_DISCORD_ID },
        update: expect.objectContaining({
          accessToken: 'mock_access_token_12345',
          refreshToken: 'mock_refresh_token_67890'
        }),
        create: expect.objectContaining({
          userId: TEST_USERS.VALID_DISCORD_ID,
          accessToken: 'mock_access_token_12345',
          refreshToken: 'mock_refresh_token_67890'
        })
      });

      expect(mockPrisma.discordUser.create).toHaveBeenCalledWith({
        data: {
          discordId: TEST_USERS.VALID_DISCORD_ID,
          discordUsername: TEST_USERS.VALID_DISCORD_ID,
          userId: TEST_USERS.VALID_DISCORD_ID,
          isAuthenticated: true
        }
      });
    });

    it('should handle user checking status after successful OAuth', async () => {
      // Complete OAuth flow first (abbreviated)
      const sessionResponse = await request(app)
        .post('/api/oauth/session')
        .send({ discordId: TEST_USERS.VALID_DISCORD_ID })
        .expect(200);

      const authUrl = new URL(sessionResponse.body.authorize_url);
      const state = authUrl.searchParams.get('state');

      yahooMock.mockTokenExchange(createMockTokenResponse());
      
      await request(app)
        .get(`/api/oauth/start?state=${encodeURIComponent(state!)}`)
        .expect(302);

      await request(app)
        .get(`/api/oauth/callback?code=test_code&state=${encodeURIComponent(state!)}`)
        .expect(200);

      // Now test status command
      const statusInteraction = createMockChatInputCommandInteraction({
        user: createMockUser({ id: TEST_USERS.VALID_DISCORD_ID }),
        options: { getSubcommand: vi.fn().mockReturnValue('status') }
      });

      // Mock the user service to return authenticated user
      mockUserService.createOrUpdateUser.mockResolvedValue(undefined);
      mockUserService.getUser.mockResolvedValue({
        id: TEST_USERS.VALID_DISCORD_ID,
        email: 'test@example.com',
        yahooUserId: TEST_USERS.VALID_DISCORD_ID,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      mockUserService.isAuthenticated.mockResolvedValue(true);

      await authCommand.execute(statusInteraction);

      expect(statusInteraction.deferReply).toHaveBeenCalled();
      expect(statusInteraction.editReply).toHaveBeenCalledWith({
        embeds: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              title: '🔐 Authentication Status',
              description: expect.stringContaining('✅ **Connected to Yahoo Fantasy Football**'),
              color: 0x00ff00
            })
          })
        ])
      });
    });

    it('should handle user logout after authentication', async () => {
      // Mock user as authenticated
      const logoutInteraction = createMockChatInputCommandInteraction({
        user: createMockUser({ id: TEST_USERS.VALID_DISCORD_ID }),
        options: { getSubcommand: vi.fn().mockReturnValue('logout') }
      });

      mockUserService.createOrUpdateUser.mockResolvedValue(undefined);
      mockUserService.isAuthenticated.mockResolvedValue(true);
      mockUserService.unlinkYahooAccount.mockResolvedValue(undefined);

      await authCommand.execute(logoutInteraction);

      expect(logoutInteraction.deferReply).toHaveBeenCalled();
      expect(mockUserService.unlinkYahooAccount).toHaveBeenCalledWith(TEST_USERS.VALID_DISCORD_ID);
      expect(logoutInteraction.editReply).toHaveBeenCalledWith({
        embeds: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              title: '🔓 Account Disconnected',
              color: 0x808080
            })
          })
        ])
      });
    });
  });

  describe('Error Scenarios in Complete Flow', () => {
    it('should handle Yahoo OAuth denial gracefully', async () => {
      // Create session
      const sessionResponse = await request(app)
        .post('/api/oauth/session')
        .send({ discordId: TEST_USERS.VALID_DISCORD_ID })
        .expect(200);

      const authUrl = new URL(sessionResponse.body.authorize_url);
      const state = authUrl.searchParams.get('state');

      // User denies OAuth
      const callbackResponse = await request(app)
        .get(`/api/oauth/callback?error=access_denied&error_description=User%20denied%20authorization&state=${encodeURIComponent(state!)}`)
        .expect(400);

      expect(callbackResponse.text).toContain('Yahoo Authorization Failed');
      expect(callbackResponse.text).toContain('access_denied');
    });

    it('should handle expired session during flow', async () => {
      // Create session
      const sessionResponse = await request(app)
        .post('/api/oauth/session')
        .send({ discordId: TEST_USERS.VALID_DISCORD_ID })
        .expect(200);

      const authUrl = new URL(sessionResponse.body.authorize_url);
      const state = authUrl.searchParams.get('state');
      const payload = verifyJWT(state!, TEST_TOKENS.VALID_JWT_SECRET);

      // Manually consume the state to simulate expiration
      await stateStore.consume(payload.jti!);

      // Try to use expired state
      const startResponse = await request(app)
        .get(`/api/oauth/start?state=${encodeURIComponent(state!)}`)
        .expect(400);

      expect(startResponse.text).toContain('Invalid Authorization Request');
    });

    it('should handle token exchange failures', async () => {
      // Create session
      const sessionResponse = await request(app)
        .post('/api/oauth/session')
        .send({ discordId: TEST_USERS.VALID_DISCORD_ID })
        .expect(200);

      const authUrl = new URL(sessionResponse.body.authorize_url);
      const state = authUrl.searchParams.get('state');

      // Mock token exchange failure
      yahooMock.mockTokenError('invalid_grant', 'Invalid authorization code');

      // Complete OAuth start
      await request(app)
        .get(`/api/oauth/start?state=${encodeURIComponent(state!)}`)
        .expect(302);

      // Callback with invalid code should fail
      const callbackResponse = await request(app)
        .get(`/api/oauth/callback?code=invalid_code&state=${encodeURIComponent(state!)}`)
        .expect(500);

      expect(callbackResponse.text).toContain('OAuth Processing Failed');
    });

    it('should handle database connection failures during callback', async () => {
      // Create session
      const sessionResponse = await request(app)
        .post('/api/oauth/session')
        .send({ discordId: TEST_USERS.VALID_DISCORD_ID })
        .expect(200);

      const authUrl = new URL(sessionResponse.body.authorize_url);
      const state = authUrl.searchParams.get('state');

      yahooMock.mockTokenExchange(createMockTokenResponse());

      // Complete OAuth start
      await request(app)
        .get(`/api/oauth/start?state=${encodeURIComponent(state!)}`)
        .expect(302);

      // Mock database failure
      mockPrisma.user.create.mockRejectedValue(new Error('Database connection failed'));

      const callbackResponse = await request(app)
        .get(`/api/oauth/callback?code=test_code&state=${encodeURIComponent(state!)}`)
        .expect(500);

      expect(callbackResponse.text).toContain('OAuth Processing Failed');
    });
  });

  describe('Multi-User Scenarios', () => {
    it('should handle multiple users authenticating simultaneously', async () => {
      const users = [TEST_USERS.VALID_DISCORD_ID, TEST_USERS.ANOTHER_DISCORD_ID];
      const promises = [];

      yahooMock.mockTokenExchange(createMockTokenResponse());

      for (const userId of users) {
        promises.push((async () => {
          // Create session for each user
          const sessionResponse = await request(app)
            .post('/api/oauth/session')
            .send({ discordId: userId })
            .expect(200);

          const authUrl = new URL(sessionResponse.body.authorize_url);
          const state = authUrl.searchParams.get('state');

          // Complete OAuth flow
          await request(app)
            .get(`/api/oauth/start?state=${encodeURIComponent(state!)}`)
            .expect(302);

          const callbackResponse = await request(app)
            .get(`/api/oauth/callback?code=test_code_${userId}&state=${encodeURIComponent(state!)}`)
            .expect(200);

          expect(callbackResponse.text).toContain(userId);
          return userId;
        })());
      }

      const results = await Promise.all(promises);
      expect(results).toEqual(users);

      // Verify both users were created in database
      expect(mockPrisma.user.create).toHaveBeenCalledTimes(users.length);
      expect(mockPrisma.yahooToken.upsert).toHaveBeenCalledTimes(users.length);
    });

    it('should maintain session isolation between users', async () => {
      // Create sessions for two users
      const session1Response = await request(app)
        .post('/api/oauth/session')
        .send({ discordId: TEST_USERS.VALID_DISCORD_ID })
        .expect(200);

      const session2Response = await request(app)
        .post('/api/oauth/session')
        .send({ discordId: TEST_USERS.ANOTHER_DISCORD_ID })
        .expect(200);

      const authUrl1 = new URL(session1Response.body.authorize_url);
      const state1 = authUrl1.searchParams.get('state');
      const payload1 = verifyJWT(state1!, TEST_TOKENS.VALID_JWT_SECRET);

      const authUrl2 = new URL(session2Response.body.authorize_url);
      const state2 = authUrl2.searchParams.get('state');
      const payload2 = verifyJWT(state2!, TEST_TOKENS.VALID_JWT_SECRET);

      // Sessions should have different JTIs and user IDs
      expect(payload1.jti).not.toBe(payload2.jti);
      expect(payload1.sub).toBe(TEST_USERS.VALID_DISCORD_ID);
      expect(payload2.sub).toBe(TEST_USERS.ANOTHER_DISCORD_ID);

      // User 1 completes OAuth
      yahooMock.mockTokenExchange(createMockTokenResponse());

      await request(app)
        .get(`/api/oauth/start?state=${encodeURIComponent(state1!)}`)
        .expect(302);

      await request(app)
        .get(`/api/oauth/callback?code=user1_code&state=${encodeURIComponent(state1!)}`)
        .expect(200);

      // User 2's session should still be valid
      const state2Record = await stateStore.get(payload2.jti!);
      expect(state2Record).toEqual({ discordId: TEST_USERS.ANOTHER_DISCORD_ID });

      // User 1's session should be consumed
      const state1Record = await stateStore.get(payload1.jti!);
      expect(state1Record).toBeNull();
    });
  });

  describe('Security Validation in Flow', () => {
    it('should prevent CSRF attacks with invalid state', async () => {
      const maliciousState = 'malicious.jwt.token';

      const startResponse = await request(app)
        .get(`/api/oauth/start?state=${encodeURIComponent(maliciousState)}`)
        .expect(400);

      expect(startResponse.text).toContain('Invalid Authorization Request');
    });

    it('should prevent session replay attacks', async () => {
      // Complete a successful OAuth flow
      const sessionResponse = await request(app)
        .post('/api/oauth/session')
        .send({ discordId: TEST_USERS.VALID_DISCORD_ID })
        .expect(200);

      const authUrl = new URL(sessionResponse.body.authorize_url);
      const state = authUrl.searchParams.get('state');

      yahooMock.mockTokenExchange(createMockTokenResponse());

      await request(app)
        .get(`/api/oauth/start?state=${encodeURIComponent(state!)}`)
        .expect(302);

      await request(app)
        .get(`/api/oauth/callback?code=test_code&state=${encodeURIComponent(state!)}`)
        .expect(200);

      // Try to replay the same callback
      const replayResponse = await request(app)
        .get(`/api/oauth/callback?code=test_code&state=${encodeURIComponent(state!)}`)
        .expect(400);

      expect(replayResponse.text).toContain('Invalid Authorization Request');
    });

    it('should validate JWT expiration in flow', async () => {
      // Create a session with very short expiry
      const shortExpiryJWT = signJWT({
        sub: TEST_USERS.VALID_DISCORD_ID,
        purpose: 'yahoo_oauth',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 1, // 1 second expiry
        jti: 'short-expiry-jti'
      }, TEST_TOKENS.VALID_JWT_SECRET);

      await stateStore.set('short-expiry-jti', { discordId: TEST_USERS.VALID_DISCORD_ID }, 1000);

      // Wait for JWT to expire
      await sleep(1100);

      const startResponse = await request(app)
        .get(`/api/oauth/start?state=${encodeURIComponent(shortExpiryJWT)}`)
        .expect(400);

      expect(startResponse.text).toContain('Invalid Authorization Request');
    });
  });

  describe('Correlation and Logging', () => {
    it('should maintain correlation between Discord interaction and OAuth callback', async () => {
      const correlationId = Math.random().toString(36).substring(7);
      
      // Mock interaction with correlation
      const mockInteraction = createMockChatInputCommandInteraction({
        id: `interaction-${correlationId}`,
        user: createMockUser({ id: TEST_USERS.VALID_DISCORD_ID })
      });

      // Execute Discord command (this should generate a session)
      await authCommand.execute(mockInteraction);

      // The auth URL should contain a state that can be traced back
      const replyCall = mockInteraction.reply.mock.calls[0][0];
      const button = replyCall.components[0].components[0];
      const authUrl = button.data.url;

      const url = new URL(authUrl);
      const state = url.searchParams.get('state');
      const payload = verifyJWT(state!, TEST_TOKENS.VALID_JWT_SECRET);

      // The payload should contain the Discord user ID for correlation
      expect(payload.sub).toBe(TEST_USERS.VALID_DISCORD_ID);

      // Complete OAuth and verify correlation is maintained
      yahooMock.mockTokenExchange(createMockTokenResponse());

      await request(app)
        .get(`/api/oauth/start?state=${encodeURIComponent(state!)}`)
        .expect(302);

      const callbackResponse = await request(app)
        .get(`/api/oauth/callback?code=test_code&state=${encodeURIComponent(state!)}`)
        .expect(200);

      expect(callbackResponse.text).toContain(TEST_USERS.VALID_DISCORD_ID);
    });
  });
});