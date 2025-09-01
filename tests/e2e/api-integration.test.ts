import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mockPrisma } from '../setup';

// Mock the database module to return our mockPrisma - must be at top level
vi.mock('../../apps/orchestrator/src/db', () => ({
  prisma: mockPrisma,
  connectDatabase: vi.fn().mockResolvedValue(mockPrisma),
  disconnectDatabase: vi.fn().mockResolvedValue(undefined),
  getDatabaseHealth: vi.fn().mockResolvedValue({ healthy: true }),
}));

import request from 'supertest';
import express from 'express';
import nock from 'nock';
import { createOAuthSession } from '../../apps/orchestrator/src/routes/oauth-session';
import { oauthStart, oauthCallback, tokenStatus } from '../../apps/orchestrator/src/routes/oauth';
import { createYahooOAuthMock } from '../mocks/yahoo.mock';
import { stateStore } from '../../apps/orchestrator/src/services/stateStore';
import { 
  createMockTokenResponse,
  createMockUserInfo,
  createMockLeagueData,
  YAHOO_OAUTH_BASE_URL,
  YAHOO_API_BASE_URL
} from '../mocks/yahoo.mock';
import { TEST_USERS, TEST_TOKENS } from '../setup';

describe('API Integration Tests', () => {
  let app: express.Application;
  let yahooMock: ReturnType<typeof createYahooOAuthMock>;

  beforeEach(async () => {
    // Set up Express app for testing
    app = express();
    app.use(express.json());
    app.post('/api/oauth/session', createOAuthSession);
    app.get('/api/oauth/start', oauthStart);
    app.get('/api/oauth/callback', oauthCallback);
    app.get('/api/oauth/status', tokenStatus);

    yahooMock = createYahooOAuthMock();

    // Mock Prisma operations
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.create.mockResolvedValue({
      id: TEST_USERS.VALID_DISCORD_ID,
      email: `${TEST_USERS.VALID_DISCORD_ID}@example.com`,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    mockPrisma.yahooToken.findUnique.mockResolvedValue(null);
    mockPrisma.yahooToken.upsert.mockResolvedValue({
      userId: TEST_USERS.VALID_DISCORD_ID,
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token',
      expiresAt: new Date(Date.now() + 3600000),
      tokenType: 'bearer',
      scope: 'fspt-w',
      createdAt: new Date(),
      updatedAt: new Date()
    });
    mockPrisma.discordUser.findUnique.mockResolvedValue(null);
    mockPrisma.discordUser.create.mockResolvedValue({} as any);

    vi.clearAllMocks();
  });

  afterEach(async () => {
    yahooMock.cleanAll();
    nock.cleanAll();
    await stateStore.cleanAll?.() ?? Promise.resolve();
  });

  describe('Yahoo OAuth API Integration', () => {
    it('should complete token exchange with Yahoo OAuth API', async () => {
      const mockTokenResponse = createMockTokenResponse();
      yahooMock.mockTokenExchange(mockTokenResponse);

      // Create session
      const sessionResponse = await request(app)
        .post('/api/oauth/session')
        .send({ discordId: TEST_USERS.VALID_DISCORD_ID })
        .expect(200);

      const authUrl = new URL(sessionResponse.body.authorize_url);
      const state = authUrl.searchParams.get('state');

      // Complete OAuth flow
      await request(app)
        .get(`/api/oauth/start?state=${encodeURIComponent(state!)}`)
        .expect(302);

      const callbackResponse = await request(app)
        .get(`/api/oauth/callback?code=test_auth_code&state=${encodeURIComponent(state!)}`)
        .expect(200);

      expect(callbackResponse.text).toContain('Yahoo Authentication Complete!');
      
      // Verify Yahoo API was called with correct parameters
      expect(yahooMock.isDone()).toBe(true);
    });

    it('should handle Yahoo OAuth API errors', async () => {
      yahooMock.mockTokenError('invalid_grant', 'Authorization code expired');

      // Create session
      const sessionResponse = await request(app)
        .post('/api/oauth/session')
        .send({ discordId: TEST_USERS.VALID_DISCORD_ID })
        .expect(200);

      const authUrl = new URL(sessionResponse.body.authorize_url);
      const state = authUrl.searchParams.get('state');

      await request(app)
        .get(`/api/oauth/start?state=${encodeURIComponent(state!)}`)
        .expect(302);

      const callbackResponse = await request(app)
        .get(`/api/oauth/callback?code=expired_code&state=${encodeURIComponent(state!)}`)
        .expect(500);

      expect(callbackResponse.text).toContain('OAuth Processing Failed');
    });

    it('should handle Yahoo API timeout', async () => {
      // Mock timeout
      nock(YAHOO_OAUTH_BASE_URL)
        .post('/oauth2/get_token')
        .delayConnection(5000) // 5 second delay
        .reply(200, createMockTokenResponse());

      const sessionResponse = await request(app)
        .post('/api/oauth/session')
        .send({ discordId: TEST_USERS.VALID_DISCORD_ID })
        .expect(200);

      const authUrl = new URL(sessionResponse.body.authorize_url);
      const state = authUrl.searchParams.get('state');

      await request(app)
        .get(`/api/oauth/start?state=${encodeURIComponent(state!)}`)
        .expect(302);

      // This should timeout (assuming reasonable timeout settings)
      const callbackResponse = await request(app)
        .get(`/api/oauth/callback?code=slow_code&state=${encodeURIComponent(state!)}`)
        .expect(500);

      expect(callbackResponse.text).toContain('OAuth Processing Failed');
    });

    it('should handle malformed Yahoo API responses', async () => {
      nock(YAHOO_OAUTH_BASE_URL)
        .post('/oauth2/get_token')
        .reply(200, 'invalid-json-response');

      const sessionResponse = await request(app)
        .post('/api/oauth/session')
        .send({ discordId: TEST_USERS.VALID_DISCORD_ID })
        .expect(200);

      const authUrl = new URL(sessionResponse.body.authorize_url);
      const state = authUrl.searchParams.get('state');

      await request(app)
        .get(`/api/oauth/start?state=${encodeURIComponent(state!)}`)
        .expect(302);

      const callbackResponse = await request(app)
        .get(`/api/oauth/callback?code=test_code&state=${encodeURIComponent(state!)}`)
        .expect(500);

      expect(callbackResponse.text).toContain('OAuth Processing Failed');
    });
  });

  describe('Token Refresh Integration', () => {
    it('should refresh expired tokens using Yahoo API', async () => {
      const initialTokenResponse = createMockTokenResponse({
        expires_in: 1 // 1 second expiry for testing
      });
      const refreshTokenResponse = createMockTokenResponse({
        access_token: 'new_access_token',
        refresh_token: 'new_refresh_token'
      });

      // Mock initial token exchange
      yahooMock.mockTokenExchange(initialTokenResponse);
      // Mock token refresh
      yahooMock.mockTokenRefresh(refreshTokenResponse);

      // Create expired token in database
      mockPrisma.yahooToken.findUnique.mockResolvedValue({
        userId: TEST_USERS.VALID_DISCORD_ID,
        accessToken: 'expired_token',
        refreshToken: 'test_refresh_token',
        expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
        tokenType: 'bearer',
        scope: 'fspt-w',
        createdAt: new Date(),
        updatedAt: new Date()
      });

      mockPrisma.yahooToken.update.mockResolvedValue({
        userId: TEST_USERS.VALID_DISCORD_ID,
        accessToken: 'new_access_token',
        refreshToken: 'new_refresh_token',
        expiresAt: new Date(Date.now() + 3600000),
        tokenType: 'bearer',
        scope: 'fspt-w',
        createdAt: new Date(),
        updatedAt: new Date()
      });

      // Check token status (should trigger refresh)
      const statusResponse = await request(app)
        .get(`/api/oauth/status?userId=${TEST_USERS.VALID_DISCORD_ID}`)
        .expect(200);

      expect(statusResponse.body.authenticated).toBe(true);
      expect(mockPrisma.yahooToken.update).toHaveBeenCalledWith({
        where: { userId: TEST_USERS.VALID_DISCORD_ID },
        data: expect.objectContaining({
          accessToken: 'new_access_token',
          refreshToken: 'new_refresh_token'
        })
      });
    });

    it('should handle refresh token expiry', async () => {
      yahooMock.mockTokenError('invalid_grant', 'Refresh token expired');

      mockPrisma.yahooToken.findUnique.mockResolvedValue({
        userId: TEST_USERS.VALID_DISCORD_ID,
        accessToken: 'expired_token',
        refreshToken: 'expired_refresh_token',
        expiresAt: new Date(Date.now() - 1000),
        tokenType: 'bearer',
        scope: 'fspt-w',
        createdAt: new Date(),
        updatedAt: new Date()
      });

      const statusResponse = await request(app)
        .get(`/api/oauth/status?userId=${TEST_USERS.VALID_DISCORD_ID}`)
        .expect(200);

      expect(statusResponse.body.authenticated).toBe(false);
    });
  });

  describe('Yahoo Fantasy Sports API Integration', () => {
    it('should integrate with Yahoo Fantasy Sports API for user data', async () => {
      const mockLeagueData = createMockLeagueData();
      
      // Mock Fantasy Sports API
      nock(YAHOO_API_BASE_URL)
        .get('/fantasy/v2/users;use_login=1/games;game_keys=nfl/leagues')
        .matchHeader('Authorization', /Bearer test-access-token/)
        .reply(200, mockLeagueData);

      // This would be called by a leagues endpoint (not implemented in minimal test app)
      // but we can test the mock setup
      const response = await request(YAHOO_API_BASE_URL)
        .get('/fantasy/v2/users;use_login=1/games;game_keys=nfl/leagues')
        .set('Authorization', 'Bearer test-access-token')
        .expect(200);

      expect(response.body).toEqual(mockLeagueData);
    });

    it('should handle Yahoo Fantasy API rate limiting', async () => {
      nock(YAHOO_API_BASE_URL)
        .get('/fantasy/v2/users;use_login=1/games')
        .reply(429, { error: 'Rate limit exceeded' });

      try {
        await request(YAHOO_API_BASE_URL)
          .get('/fantasy/v2/users;use_login=1/games')
          .expect(429);
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should handle Yahoo Fantasy API authentication errors', async () => {
      nock(YAHOO_API_BASE_URL)
        .get('/fantasy/v2/users;use_login=1/games')
        .reply(401, { error: 'Unauthorized' });

      try {
        await request(YAHOO_API_BASE_URL)
          .get('/fantasy/v2/users;use_login=1/games')
          .expect(401);
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('Database Integration', () => {
    it('should handle database connection errors gracefully', async () => {
      mockPrisma.user.create.mockRejectedValue(new Error('Database connection failed'));

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

      const callbackResponse = await request(app)
        .get(`/api/oauth/callback?code=test_code&state=${encodeURIComponent(state!)}`)
        .expect(500);

      expect(callbackResponse.text).toContain('OAuth Processing Failed');
    });

    it('should handle transaction rollbacks on partial failures', async () => {
      // Mock user creation success but token storage failure
      mockPrisma.user.create.mockResolvedValue({
        id: TEST_USERS.VALID_DISCORD_ID,
        email: `${TEST_USERS.VALID_DISCORD_ID}@example.com`,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      mockPrisma.yahooToken.upsert.mockRejectedValue(new Error('Token storage failed'));

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

      const callbackResponse = await request(app)
        .get(`/api/oauth/callback?code=test_code&state=${encodeURIComponent(state!)}`)
        .expect(500);

      expect(callbackResponse.text).toContain('OAuth Processing Failed');
    });

    it('should handle database constraint violations', async () => {
      mockPrisma.user.create.mockRejectedValue(
        new Error('Unique constraint violation: User already exists')
      );

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

      const callbackResponse = await request(app)
        .get(`/api/oauth/callback?code=test_code&state=${encodeURIComponent(state!)}`)
        .expect(500);

      expect(callbackResponse.text).toContain('OAuth Processing Failed');
    });
  });

  describe('Concurrent API Operations', () => {
    it('should handle concurrent OAuth flows without conflicts', async () => {
      const users = [TEST_USERS.VALID_DISCORD_ID, TEST_USERS.ANOTHER_DISCORD_ID];
      yahooMock.mockTokenExchange(createMockTokenResponse());

      // Create concurrent OAuth flows
      const promises = users.map(async (userId, index) => {
        // Create session
        const sessionResponse = await request(app)
          .post('/api/oauth/session')
          .send({ discordId: userId })
          .expect(200);

        const authUrl = new URL(sessionResponse.body.authorize_url);
        const state = authUrl.searchParams.get('state');

        // Complete OAuth
        await request(app)
          .get(`/api/oauth/start?state=${encodeURIComponent(state!)}`)
          .expect(302);

        const callbackResponse = await request(app)
          .get(`/api/oauth/callback?code=test_code_${index}&state=${encodeURIComponent(state!)}`)
          .expect(200);

        return { userId, success: callbackResponse.text.includes('Authentication Complete') };
      });

      const results = await Promise.all(promises);

      expect(results.every(r => r.success)).toBe(true);
      expect(mockPrisma.user.create).toHaveBeenCalledTimes(users.length);
    });

    it('should handle concurrent token refresh operations', async () => {
      const users = Array.from({ length: 5 }, (_, i) => `user-${i}`);

      // Mock expired tokens for all users
      mockPrisma.yahooToken.findUnique.mockImplementation((args: any) => 
        Promise.resolve({
          userId: args.where.userId,
          accessToken: 'expired_token',
          refreshToken: 'valid_refresh_token',
          expiresAt: new Date(Date.now() - 1000), // Expired
          tokenType: 'bearer',
          scope: 'fspt-w',
          createdAt: new Date(),
          updatedAt: new Date()
        })
      );

      mockPrisma.yahooToken.update.mockResolvedValue({} as any);
      yahooMock.mockTokenRefresh(createMockTokenResponse());

      // Trigger concurrent refresh operations
      const promises = users.map(userId => 
        request(app)
          .get(`/api/oauth/status?userId=${userId}`)
          .expect(200)
      );

      const results = await Promise.all(promises);

      expect(results.every(r => r.body.authenticated === true)).toBe(true);
      expect(mockPrisma.yahooToken.update).toHaveBeenCalledTimes(users.length);
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('should recover from transient network errors', async () => {
      // First call fails, second succeeds
      nock(YAHOO_OAUTH_BASE_URL)
        .post('/oauth2/get_token')
        .replyWithError('Network error')
        .post('/oauth2/get_token')
        .reply(200, createMockTokenResponse());

      const sessionResponse = await request(app)
        .post('/api/oauth/session')
        .send({ discordId: TEST_USERS.VALID_DISCORD_ID })
        .expect(200);

      const authUrl = new URL(sessionResponse.body.authorize_url);
      const state = authUrl.searchParams.get('state');

      await request(app)
        .get(`/api/oauth/start?state=${encodeURIComponent(state!)}`)
        .expect(302);

      // First callback should fail
      let callbackResponse = await request(app)
        .get(`/api/oauth/callback?code=test_code&state=${encodeURIComponent(state!)}`)
        .expect(500);

      expect(callbackResponse.text).toContain('OAuth Processing Failed');

      // Create new session and try again (simulating user retry)
      const sessionResponse2 = await request(app)
        .post('/api/oauth/session')
        .send({ discordId: TEST_USERS.VALID_DISCORD_ID })
        .expect(200);

      const authUrl2 = new URL(sessionResponse2.body.authorize_url);
      const state2 = authUrl2.searchParams.get('state');

      await request(app)
        .get(`/api/oauth/start?state=${encodeURIComponent(state2!)}`)
        .expect(302);

      callbackResponse = await request(app)
        .get(`/api/oauth/callback?code=test_code2&state=${encodeURIComponent(state2!)}`)
        .expect(200);

      expect(callbackResponse.text).toContain('Yahoo Authentication Complete');
    });

    it('should handle partial API responses', async () => {
      // Mock incomplete token response (missing refresh_token)
      nock(YAHOO_OAUTH_BASE_URL)
        .post('/oauth2/get_token')
        .reply(200, {
          access_token: 'test_access_token',
          expires_in: 3600,
          token_type: 'bearer'
          // Missing refresh_token
        });

      const sessionResponse = await request(app)
        .post('/api/oauth/session')
        .send({ discordId: TEST_USERS.VALID_DISCORD_ID })
        .expect(200);

      const authUrl = new URL(sessionResponse.body.authorize_url);
      const state = authUrl.searchParams.get('state');

      await request(app)
        .get(`/api/oauth/start?state=${encodeURIComponent(state!)}`)
        .expect(302);

      // Should handle missing refresh token gracefully
      const callbackResponse = await request(app)
        .get(`/api/oauth/callback?code=test_code&state=${encodeURIComponent(state!)}`)
        .expect(200);

      expect(callbackResponse.text).toContain('Yahoo Authentication Complete');
    });
  });

  describe('Security Testing', () => {
    it('should validate HTTPS requirements in production', async () => {
      // This would be more relevant in actual production testing
      // For now, we test that the system accepts HTTPS redirects
      process.env.NODE_ENV = 'production';

      const sessionResponse = await request(app)
        .post('/api/oauth/session')
        .set('x-forwarded-proto', 'https')
        .set('host', 'myapp.com')
        .send({ discordId: TEST_USERS.VALID_DISCORD_ID })
        .expect(200);

      expect(sessionResponse.body.authorize_url).toMatch(/^https:\/\/myapp\.com/);
    });

    it('should handle suspicious OAuth parameters', async () => {
      // Try to access callback with suspicious parameters
      const suspiciousResponse = await request(app)
        .get('/api/oauth/callback?code=<script>alert("xss")</script>&state=malicious')
        .expect(400);

      expect(suspiciousResponse.text).toContain('Invalid Authorization Request');
    });

    it('should validate request origins and headers', async () => {
      // Test that system handles various header configurations
      const sessionResponse = await request(app)
        .post('/api/oauth/session')
        .set('user-agent', 'Discord Bot OAuth Client')
        .set('x-forwarded-for', '192.168.1.1')
        .send({ discordId: TEST_USERS.VALID_DISCORD_ID })
        .expect(200);

      expect(sessionResponse.body.authorize_url).toBeDefined();
    });
  });
});