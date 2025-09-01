import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createOAuthSession } from '../../apps/orchestrator/src/routes/oauth-session';
import { stateStore } from '../../apps/orchestrator/src/services/stateStore';
import { signJWT, verifyJWT } from '../../apps/orchestrator/src/utils/jwt';
import { 
  createMockRequest, 
  createMockResponse, 
  createTestJWT, 
  expectValidJWT,
  sleep,
  withTestEnv
} from '../utils/test-helpers';
import { TEST_USERS, TEST_TOKENS } from '../setup';

describe('OAuth Session Management', () => {
  let mockReq: any;
  let mockRes: any;

  beforeEach(() => {
    mockReq = createMockRequest();
    mockRes = createMockResponse();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Clean up state store
    await stateStore.cleanAll?.() ?? Promise.resolve();
  });

  describe('createOAuthSession', () => {
    it('should create a valid OAuth session with JWT state', async () => {
      mockReq.body = { discordId: TEST_USERS.VALID_DISCORD_ID };

      await createOAuthSession(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        authorize_url: expect.stringMatching(/^http:\/\/localhost:3000\/api\/oauth\/start\?state=/)
      });

      // Extract the JWT from the URL
      const jsonCall = mockRes.json.mock.calls[0][0];
      const url = new URL(jsonCall.authorize_url);
      const state = url.searchParams.get('state');
      
      expect(state).toBeTruthy();
      
      // Verify JWT structure manually since env config might not be loaded
      const parts = state!.split('.');
      expect(parts).toHaveLength(3);
      
      // Decode payload and verify content
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      expect(payload.sub).toBe(TEST_USERS.VALID_DISCORD_ID);
      expect(payload.purpose).toBe('yahoo_oauth');
      expect(payload.jti).toBeTruthy();
      expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });

    it('should store state record in stateStore with TTL', async () => {
      mockReq.body = { discordId: TEST_USERS.VALID_DISCORD_ID };

      await createOAuthSession(mockReq, mockRes);

      const jsonCall = mockRes.json.mock.calls[0][0];
      const url = new URL(jsonCall.authorize_url);
      const state = url.searchParams.get('state');
      const payload = verifyJWT(state!, process.env.OAUTH_STATE_JWT_SECRET!);

      // Verify the jti was stored in the state store
      const storedRecord = await stateStore.get(payload.jti);
      expect(storedRecord).toEqual({
        discordId: TEST_USERS.VALID_DISCORD_ID
      });
    });

    it('should reject invalid discordId', async () => {
      mockReq.body = { discordId: 'abc' }; // Too short

      await createOAuthSession(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Invalid body',
        details: expect.any(Object)
      });
    });

    it('should reject missing discordId', async () => {
      mockReq.body = {};

      await createOAuthSession(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Invalid body',
        details: expect.any(Object)
      });
    });

    it('should use custom JWT secret from environment', async () => {
      const customSecret = 'custom-test-secret-32-chars-long';
      const originalSecret = process.env.OAUTH_STATE_JWT_SECRET!;
      
      let state: string | null = null;
      
      await withTestEnv({ OAUTH_STATE_JWT_SECRET: customSecret }, async () => {
        mockReq.body = { discordId: TEST_USERS.VALID_DISCORD_ID };

        await createOAuthSession(mockReq, mockRes);

        const jsonCall = mockRes.json.mock.calls[0][0];
        const url = new URL(jsonCall.authorize_url);
        state = url.searchParams.get('state');
      })();
      
      // Should be verifiable with custom secret
      expect(() => verifyJWT(state!, customSecret)).not.toThrow();
      // Should NOT be verifiable with original secret
      expect(() => verifyJWT(state!, originalSecret)).toThrow();
    });

    it('should include kid in JWT header when provided', async () => {
      await withTestEnv({ JWT_KID: 'test-kid-123' }, async () => {
        mockReq.body = { discordId: TEST_USERS.VALID_DISCORD_ID };

        await createOAuthSession(mockReq, mockRes);

        const jsonCall = mockRes.json.mock.calls[0][0];
        const url = new URL(jsonCall.authorize_url);
        const state = url.searchParams.get('state');
        
        // Decode JWT header to check kid
        const [headerB64] = state!.split('.');
        const header = JSON.parse(Buffer.from(headerB64, 'base64').toString());
        expect(header.kid).toBe('test-kid-123');
      })();
    });

    it('should handle X-Forwarded-Proto header for HTTPS', async () => {
      mockReq.headers['x-forwarded-proto'] = 'https';
      mockReq.body = { discordId: TEST_USERS.VALID_DISCORD_ID };

      await createOAuthSession(mockReq, mockRes);

      const jsonCall = mockRes.json.mock.calls[0][0];
      expect(jsonCall.authorize_url).toMatch(/^https:\/\/localhost:3000\/api\/oauth\/start/);
    });

    it('should set appropriate TTL for state record', async () => {
      mockReq.body = { discordId: TEST_USERS.VALID_DISCORD_ID };

      await createOAuthSession(mockReq, mockRes);

      const jsonCall = mockRes.json.mock.calls[0][0];
      const url = new URL(jsonCall.authorize_url);
      const state = url.searchParams.get('state');
      const payload = verifyJWT(state!, process.env.OAUTH_STATE_JWT_SECRET!);

      // State should be available
      let storedRecord = await stateStore.get(payload.jti);
      expect(storedRecord).toBeTruthy();

      // Wait a bit and it should still be there (TTL is 5 minutes)
      await sleep(100);
      storedRecord = await stateStore.get(payload.jti);
      expect(storedRecord).toBeTruthy();
    });
  });

  describe('JWT Token Validation', () => {
    it('should create JWT with correct structure and claims', () => {
      const payload = {
        sub: TEST_USERS.VALID_DISCORD_ID,
        purpose: 'yahoo_oauth',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 300,
        jti: 'test-jti-123',
      };

      const token = signJWT(payload, process.env.OAUTH_STATE_JWT_SECRET!);
      const verified = verifyJWT(token, process.env.OAUTH_STATE_JWT_SECRET!);

      expect(verified.sub).toBe(TEST_USERS.VALID_DISCORD_ID);
      expect(verified.purpose).toBe('yahoo_oauth');
      expect(verified.jti).toBe('test-jti-123');
      expect(verified.iat).toBe(payload.iat);
      expect(verified.exp).toBe(payload.exp);
    });

    it('should reject expired JWT', () => {
      const expiredPayload = {
        sub: TEST_USERS.VALID_DISCORD_ID,
        purpose: 'yahoo_oauth',
        iat: Math.floor(Date.now() / 1000) - 600,
        exp: Math.floor(Date.now() / 1000) - 300, // Expired 5 minutes ago
        jti: 'expired-jti',
      };

      const token = signJWT(expiredPayload, process.env.OAUTH_STATE_JWT_SECRET!);
      expect(() => verifyJWT(token, process.env.OAUTH_STATE_JWT_SECRET!))
        .toThrow('Token expired');
    });

    it('should reject JWT with invalid signature', () => {
      const payload = {
        sub: TEST_USERS.VALID_DISCORD_ID,
        purpose: 'yahoo_oauth',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 300,
        jti: 'test-jti',
      };

      const token = signJWT(payload, 'correct-secret');
      expect(() => verifyJWT(token, 'wrong-secret'))
        .toThrow('Invalid signature');
    });

    it('should reject malformed JWT', () => {
      expect(() => verifyJWT('not.a.jwt', process.env.OAUTH_STATE_JWT_SECRET!))
        .toThrow('Invalid token');
      
      expect(() => verifyJWT('header.payload', process.env.OAUTH_STATE_JWT_SECRET!))
        .toThrow('Invalid token');
        
      expect(() => verifyJWT('', process.env.OAUTH_STATE_JWT_SECRET!))
        .toThrow('Invalid token');
    });
  });

  describe('State Store Behavior', () => {
    it('should store and retrieve state records', async () => {
      const key = 'test-key-123';
      const value = { discordId: TEST_USERS.VALID_DISCORD_ID };

      await stateStore.set(key, value, 5000); // 5 second TTL
      const retrieved = await stateStore.get(key);

      expect(retrieved).toEqual(value);
    });

    it('should expire records after TTL', async () => {
      const key = 'expiring-key';
      const value = { discordId: TEST_USERS.VALID_DISCORD_ID };

      await stateStore.set(key, value, 100); // 100ms TTL
      
      // Should be available immediately
      let retrieved = await stateStore.get(key);
      expect(retrieved).toEqual(value);

      // Wait for expiration
      await sleep(150);
      retrieved = await stateStore.get(key);
      expect(retrieved).toBeNull();
    });

    it('should support consume-once semantics', async () => {
      const key = 'consume-once-key';
      const value = { discordId: TEST_USERS.VALID_DISCORD_ID };

      await stateStore.set(key, value, 5000);

      // First consume should work
      const first = await stateStore.consume(key);
      expect(first).toEqual(value);

      // Second consume should return null
      const second = await stateStore.consume(key);
      expect(second).toBeNull();

      // Regular get should also return null after consumption
      const retrieved = await stateStore.get(key);
      expect(retrieved).toBeNull();
    });

    it('should return null for non-existent keys', async () => {
      const retrieved = await stateStore.get('non-existent-key');
      expect(retrieved).toBeNull();

      const consumed = await stateStore.consume('non-existent-key');
      expect(consumed).toBeNull();
    });

    it('should clean up expired records automatically', async () => {
      const key1 = 'key-1';
      const key2 = 'key-2';
      const value = { discordId: TEST_USERS.VALID_DISCORD_ID };

      // Set one with short TTL, one with long TTL
      await stateStore.set(key1, value, 50); // 50ms
      await stateStore.set(key2, value, 5000); // 5s

      // Both should be available initially
      expect(await stateStore.get(key1)).toEqual(value);
      expect(await stateStore.get(key2)).toEqual(value);

      // Wait for first to expire
      await sleep(100);

      // First should be cleaned up, second should remain
      expect(await stateStore.get(key1)).toBeNull();
      expect(await stateStore.get(key2)).toEqual(value);
    });
  });
});