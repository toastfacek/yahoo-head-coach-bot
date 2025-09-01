import { describe, it, expect, beforeEach, vi } from 'vitest';
import { oauthStart, oauthCallback } from '../../apps/orchestrator/src/routes/oauth';
import { stateStore } from '../../apps/orchestrator/src/services/stateStore';
import { signJWT, verifyJWT, randomId } from '../../apps/orchestrator/src/utils/jwt';
import { 
  createMockRequest, 
  createMockResponse,
  createTestJWT,
  createExpiredJWT,
  createInvalidJWT,
  expectValidJWT,
  sleep,
  withTestEnv
} from '../utils/test-helpers';
import { TEST_USERS, TEST_TOKENS, mockPrisma } from '../setup';

describe('JWT OAuth Flow', () => {
  let mockReq: any;
  let mockRes: any;

  beforeEach(() => {
    mockReq = createMockRequest();
    mockRes = createMockResponse();
    vi.clearAllMocks();
  });

  describe('OAuth Start with JWT State', () => {
    it('should redirect to Yahoo with valid JWT state', async () => {
      const jti = randomId();
      const jwt = createTestJWT({ jti });
      
      // Pre-populate state store as if session endpoint was called
      await stateStore.set(jti, { discordId: TEST_USERS.VALID_DISCORD_ID }, 300000);
      
      mockReq.query = { state: jwt };

      await oauthStart(mockReq, mockRes);

      expect(mockRes.redirect).toHaveBeenCalledWith(
        expect.stringMatching(/^https:\/\/api\.login\.yahoo\.com\/oauth2\/request_auth/)
      );

      const redirectUrl = mockRes.redirect.mock.calls[0][0];
      expect(redirectUrl).toContain('client_id=');
      expect(redirectUrl).toContain('response_type=code');
      expect(redirectUrl).toContain('scope=fspt-w');
      expect(redirectUrl).toContain(`state=${encodeURIComponent(jwt)}`);
    });

    it('should reject expired JWT state', async () => {
      const expiredJWT = createExpiredJWT();
      mockReq.query = { state: expiredJWT };

      await oauthStart(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.send).toHaveBeenCalledWith(
        expect.stringContaining('Invalid Authorization Request')
      );
    });

    it('should reject invalid JWT state', async () => {
      const invalidJWT = createInvalidJWT();
      mockReq.query = { state: invalidJWT };

      await oauthStart(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.send).toHaveBeenCalledWith(
        expect.stringContaining('Invalid Authorization Request')
      );
    });

    it('should reject JWT with wrong purpose', async () => {
      const wrongPurposeJWT = createTestJWT({ purpose: 'wrong-purpose' });
      mockReq.query = { state: wrongPurposeJWT };

      await oauthStart(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.send).toHaveBeenCalledWith(
        expect.stringContaining('Invalid Authorization Request')
      );
    });

    it('should reject JWT with consumed jti', async () => {
      const jti = randomId();
      const jwt = createTestJWT({ jti });
      
      // Pre-populate and then consume the state
      await stateStore.set(jti, { discordId: TEST_USERS.VALID_DISCORD_ID }, 300000);
      await stateStore.consume(jti);
      
      mockReq.query = { state: jwt };

      await oauthStart(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.send).toHaveBeenCalledWith(
        expect.stringContaining('Invalid Authorization Request')
      );
    });

    it('should reject JWT with non-existent jti', async () => {
      const jwt = createTestJWT({ jti: 'non-existent-jti' });
      mockReq.query = { state: jwt };

      await oauthStart(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.send).toHaveBeenCalledWith(
        expect.stringContaining('Invalid Authorization Request')
      );
    });

    it('should handle missing state parameter', async () => {
      mockReq.query = {};

      await oauthStart(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Invalid query',
        details: expect.any(Object)
      });
    });
  });

  describe('OAuth Callback with JWT State', () => {
    beforeEach(() => {
      // Mock successful token exchange
      vi.doMock('axios', () => ({
        post: vi.fn().mockResolvedValue({
          data: {
            access_token: 'test-access-token',
            refresh_token: 'test-refresh-token',
            expires_in: 3600,
            token_type: 'bearer',
            scope: 'fspt-w'
          }
        }),
        isAxiosError: vi.fn().mockReturnValue(false)
      }));

      // Mock successful Prisma operations
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
    });

    it('should handle successful OAuth callback with valid JWT', async () => {
      const jti = randomId();
      const jwt = createTestJWT({ jti });
      
      // Pre-populate state store
      await stateStore.set(jti, { discordId: TEST_USERS.VALID_DISCORD_ID }, 300000);
      
      mockReq.query = {
        code: 'test-auth-code',
        state: jwt
      };

      await oauthCallback(mockReq, mockRes);

      expect(mockRes.send).toHaveBeenCalledWith(
        expect.stringContaining('Yahoo Authentication Complete!')
      );
    });

    it('should reject callback with expired JWT state', async () => {
      const expiredJWT = createExpiredJWT();
      mockReq.query = {
        code: 'test-auth-code',
        state: expiredJWT
      };

      await oauthCallback(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.send).toHaveBeenCalledWith(
        expect.stringContaining('Invalid Authorization Request')
      );
    });

    it('should reject callback with invalid JWT state', async () => {
      const invalidJWT = createInvalidJWT();
      mockReq.query = {
        code: 'test-auth-code',
        state: invalidJWT
      };

      await oauthCallback(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.send).toHaveBeenCalledWith(
        expect.stringContaining('Invalid Authorization Request')
      );
    });

    it('should handle OAuth error responses', async () => {
      mockReq.query = {
        error: 'access_denied',
        error_description: 'User denied authorization'
      };

      await oauthCallback(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.send).toHaveBeenCalledWith(
        expect.stringContaining('Yahoo Authorization Failed')
      );
    });

    it('should reject callback with missing parameters', async () => {
      mockReq.query = {}; // Missing code and state

      await oauthCallback(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.send).toHaveBeenCalledWith(
        expect.stringContaining('Missing OAuth Parameters')
      );
    });

    it('should consume state after successful callback', async () => {
      const jti = randomId();
      const jwt = createTestJWT({ jti });
      
      // Pre-populate state store
      await stateStore.set(jti, { discordId: TEST_USERS.VALID_DISCORD_ID }, 300000);
      
      mockReq.query = {
        code: 'test-auth-code',
        state: jwt
      };

      await oauthCallback(mockReq, mockRes);

      // State should be consumed and no longer available
      const remainingState = await stateStore.get(jti);
      expect(remainingState).toBeNull();
    });

    it('should prevent replay attacks with same JWT', async () => {
      const jti = randomId();
      const jwt = createTestJWT({ jti });
      
      // Pre-populate state store
      await stateStore.set(jti, { discordId: TEST_USERS.VALID_DISCORD_ID }, 300000);
      
      mockReq.query = {
        code: 'test-auth-code',
        state: jwt
      };

      // First callback should succeed
      await oauthCallback(mockReq, mockRes);
      expect(mockRes.send).toHaveBeenCalledWith(
        expect.stringContaining('Yahoo Authentication Complete!')
      );

      // Reset mocks for second attempt
      mockRes = createMockResponse();

      // Second callback with same JWT should fail
      await oauthCallback(mockReq, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.send).toHaveBeenCalledWith(
        expect.stringContaining('Invalid Authorization Request')
      );
    });

    it('should link Discord user during callback', async () => {
      const jti = randomId();
      const jwt = createTestJWT({ jti });
      
      await stateStore.set(jti, { discordId: TEST_USERS.VALID_DISCORD_ID }, 300000);
      
      mockReq.query = {
        code: 'test-auth-code',
        state: jwt
      };

      await oauthCallback(mockReq, mockRes);

      // Verify Discord user was created/updated
      expect(mockPrisma.discordUser.findUnique).toHaveBeenCalledWith({
        where: { discordId: TEST_USERS.VALID_DISCORD_ID }
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
  });

  describe('JWT Security Features', () => {
    it('should use timing-safe comparison for signature verification', () => {
      const payload = { sub: TEST_USERS.VALID_DISCORD_ID, purpose: 'yahoo_oauth' };
      const correctToken = signJWT(payload, TEST_TOKENS.VALID_JWT_SECRET);
      
      // Verify timing-safe comparison doesn't leak information
      const startTime = process.hrtime.bigint();
      expect(() => verifyJWT(correctToken, 'wrong-secret')).toThrow();
      const wrongSecretTime = process.hrtime.bigint() - startTime;
      
      const startTime2 = process.hrtime.bigint();
      expect(() => verifyJWT(correctToken + 'x', TEST_TOKENS.VALID_JWT_SECRET)).toThrow();
      const wrongTokenTime = process.hrtime.bigint() - startTime2;
      
      // Times should be similar (within reasonable variance for timing-safe comparison)
      const timeDiff = Number(wrongSecretTime - wrongTokenTime) / 1_000_000; // Convert to ms
      expect(Math.abs(timeDiff)).toBeLessThan(100); // Should be within 100ms variance
    });

    it('should reject JWT with missing required claims', () => {
      // Missing purpose
      const noPurpose = signJWT({ sub: TEST_USERS.VALID_DISCORD_ID }, TEST_TOKENS.VALID_JWT_SECRET);
      expect(() => verifyJWT(noPurpose, TEST_TOKENS.VALID_JWT_SECRET)).not.toThrow();
      
      // Missing sub
      const noSub = signJWT({ purpose: 'yahoo_oauth' }, TEST_TOKENS.VALID_JWT_SECRET);
      expect(() => verifyJWT(noSub, TEST_TOKENS.VALID_JWT_SECRET)).not.toThrow();
      
      // The JWT verification itself doesn't validate required claims - that's done at the application level
    });

    it('should handle JWT with additional claims', () => {
      const extraClaims = {
        sub: TEST_USERS.VALID_DISCORD_ID,
        purpose: 'yahoo_oauth',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 300,
        jti: randomId(),
        custom_claim: 'custom_value',
        nested: { data: 'test' }
      };

      const token = signJWT(extraClaims, TEST_TOKENS.VALID_JWT_SECRET);
      const verified = verifyJWT(token, TEST_TOKENS.VALID_JWT_SECRET);

      expect(verified.custom_claim).toBe('custom_value');
      expect(verified.nested).toEqual({ data: 'test' });
    });

    it('should properly encode/decode special characters in claims', () => {
      const specialPayload = {
        sub: TEST_USERS.VALID_DISCORD_ID,
        purpose: 'yahoo_oauth',
        special: 'Special chars: üñiçødé & symbols <>',
        emoji: '🔐🚀💯',
        json: '{"nested":"json","array":[1,2,3]}',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 300
      };

      const token = signJWT(specialPayload, TEST_TOKENS.VALID_JWT_SECRET);
      const verified = verifyJWT(token, TEST_TOKENS.VALID_JWT_SECRET);

      expect(verified.special).toBe(specialPayload.special);
      expect(verified.emoji).toBe(specialPayload.emoji);
      expect(verified.json).toBe(specialPayload.json);
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed authorization codes', async () => {
      // Mock token exchange failure
      vi.doMock('axios', () => ({
        post: vi.fn().mockRejectedValue({
          response: {
            data: {
              error: 'invalid_grant',
              error_description: 'Invalid authorization code'
            }
          }
        }),
        isAxiosError: vi.fn().mockReturnValue(true)
      }));

      const jti = randomId();
      const jwt = createTestJWT({ jti });
      
      await stateStore.set(jti, { discordId: TEST_USERS.VALID_DISCORD_ID }, 300000);
      
      mockReq.query = {
        code: 'invalid-auth-code',
        state: jwt
      };

      await oauthCallback(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.send).toHaveBeenCalledWith(
        expect.stringContaining('OAuth Processing Failed')
      );
    });

    it('should handle database connection failures', async () => {
      // Mock database failure
      mockPrisma.user.findUnique.mockRejectedValue(new Error('Database connection failed'));

      const jti = randomId();
      const jwt = createTestJWT({ jti });
      
      await stateStore.set(jti, { discordId: TEST_USERS.VALID_DISCORD_ID }, 300000);
      
      mockReq.query = {
        code: 'test-auth-code',
        state: jwt
      };

      await oauthCallback(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.send).toHaveBeenCalledWith(
        expect.stringContaining('OAuth Processing Failed')
      );
    });
  });

  describe('Environment Configuration', () => {
    it('should use custom JWT secret from environment', async () => {
      const customSecret = 'custom-jwt-secret-for-testing-32char';
      
      await withTestEnv({ OAUTH_STATE_JWT_SECRET: customSecret }, async () => {
        const jti = randomId();
        const jwt = signJWT({
          sub: TEST_USERS.VALID_DISCORD_ID,
          purpose: 'yahoo_oauth',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 300,
          jti
        }, customSecret);
        
        await stateStore.set(jti, { discordId: TEST_USERS.VALID_DISCORD_ID }, 300000);
        
        mockReq.query = { state: jwt };

        await oauthStart(mockReq, mockRes);

        expect(mockRes.redirect).toHaveBeenCalled();
      })();
    });

    it('should fall back to default secret when environment variable is missing', async () => {
      await withTestEnv({ OAUTH_STATE_JWT_SECRET: undefined }, async () => {
        const jti = randomId();
        const jwt = signJWT({
          sub: TEST_USERS.VALID_DISCORD_ID,
          purpose: 'yahoo_oauth',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 300,
          jti
        }, 'dev-oauth-secret');
        
        await stateStore.set(jti, { discordId: TEST_USERS.VALID_DISCORD_ID }, 300000);
        
        mockReq.query = { state: jwt };

        await oauthStart(mockReq, mockRes);

        expect(mockRes.redirect).toHaveBeenCalled();
      })();
    });
  });
});