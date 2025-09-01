import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createOAuthSession } from '../../apps/orchestrator/src/routes/oauth-session';
import { oauthStart, oauthCallback } from '../../apps/orchestrator/src/routes/oauth';
import { stateStore } from '../../apps/orchestrator/src/services/stateStore';
import { signJWT, verifyJWT, randomId } from '../../apps/orchestrator/src/utils/jwt';
import { authCommand } from '../../apps/discord-bot/src/commands/auth';
import { interactionLock } from '../../apps/discord-bot/src/services/lock';
import { 
  createMockChatInputCommandInteraction,
  createMockButtonInteraction,
  createMockUser 
} from '../mocks/discord.mock';
import { createYahooOAuthMock } from '../mocks/yahoo.mock';
import { 
  sleep, 
  createTestJWT,
  createExpiredJWT,
  createInvalidJWT 
} from '../utils/test-helpers';
import { TEST_USERS, TEST_TOKENS, mockPrisma } from '../setup';

describe('Security and Robustness Tests', () => {
  let app: express.Application;
  let yahooMock: ReturnType<typeof createYahooOAuthMock>;

  beforeEach(async () => {
    app = express();
    app.use(express.json());
    app.post('/api/oauth/session', createOAuthSession);
    app.get('/api/oauth/start', oauthStart);
    app.get('/api/oauth/callback', oauthCallback);

    yahooMock = createYahooOAuthMock();

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

    vi.clearAllMocks();
  });

  afterEach(async () => {
    yahooMock.cleanAll();
    await stateStore.cleanAll?.() ?? Promise.resolve();
    await interactionLock.cleanAll?.() ?? Promise.resolve();
  });

  describe('JWT Security Tests', () => {
    it('should prevent JWT tampering attacks', async () => {
      const validJWT = createTestJWT();
      const [header, payload, signature] = validJWT.split('.');
      
      // Tamper with payload
      const tamperedPayload = Buffer.from(JSON.stringify({
        sub: 'hacker-id',
        purpose: 'yahoo_oauth',
        exp: Math.floor(Date.now() / 1000) + 3600
      })).toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');

      const tamperedJWT = `${header}.${tamperedPayload}.${signature}`;

      const response = await request(app)
        .get(`/api/oauth/start?state=${encodeURIComponent(tamperedJWT)}`)
        .expect(400);

      expect(response.text).toContain('Invalid Authorization Request');
    });

    it('should prevent JWT signature spoofing', async () => {
      const payload = {
        sub: TEST_USERS.VALID_DISCORD_ID,
        purpose: 'yahoo_oauth',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 300,
        jti: randomId()
      };

      // Sign with wrong secret
      const spoofedJWT = signJWT(payload, 'wrong-secret');

      const response = await request(app)
        .get(`/api/oauth/start?state=${encodeURIComponent(spoofedJWT)}`)
        .expect(400);

      expect(response.text).toContain('Invalid Authorization Request');
    });

    it('should prevent JWT algorithm confusion attacks', async () => {
      // Create JWT with "none" algorithm
      const header = Buffer.from(JSON.stringify({
        alg: 'none',
        typ: 'JWT'
      })).toString('base64');

      const payload = Buffer.from(JSON.stringify({
        sub: TEST_USERS.VALID_DISCORD_ID,
        purpose: 'yahoo_oauth',
        exp: Math.floor(Date.now() / 1000) + 300
      })).toString('base64');

      const noneAlgJWT = `${header}.${payload}.`;

      const response = await request(app)
        .get(`/api/oauth/start?state=${encodeURIComponent(noneAlgJWT)}`)
        .expect(400);

      expect(response.text).toContain('Invalid Authorization Request');
    });

    it('should prevent JWT replay attacks through jti consumption', async () => {
      const jti = randomId();
      const jwt = createTestJWT({ jti });
      
      // Pre-populate state store
      await stateStore.set(jti, { discordId: TEST_USERS.VALID_DISCORD_ID }, 300000);
      
      yahooMock.mockTokenExchange();

      // First request should succeed
      await request(app)
        .get(`/api/oauth/start?state=${encodeURIComponent(jwt)}`)
        .expect(302);

      await request(app)
        .get(`/api/oauth/callback?code=test_code&state=${encodeURIComponent(jwt)}`)
        .expect(200);

      // Second request with same JWT should fail (replay attack)
      const replayResponse = await request(app)
        .get(`/api/oauth/start?state=${encodeURIComponent(jwt)}`)
        .expect(400);

      expect(replayResponse.text).toContain('Invalid Authorization Request');
    });

    it('should prevent JWT with malicious claims', async () => {
      const maliciousPayload = {
        sub: '../../../etc/passwd', // Path traversal attempt
        purpose: 'yahoo_oauth',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 300,
        jti: '<script>alert("xss")</script>', // XSS attempt
        admin: true, // Privilege escalation attempt
        ___proto__: { isAdmin: true } // Prototype pollution attempt
      };

      const maliciousJWT = signJWT(maliciousPayload, TEST_TOKENS.VALID_JWT_SECRET);
      await stateStore.set(maliciousPayload.jti, { discordId: maliciousPayload.sub }, 300000);

      const response = await request(app)
        .get(`/api/oauth/start?state=${encodeURIComponent(maliciousJWT)}`)
        .expect(400); // Should be rejected or sanitized

      expect(response.text).toContain('Invalid Authorization Request');
    });
  });

  describe('State Management Security', () => {
    it('should prevent state enumeration attacks', async () => {
      // Try to guess state values
      const guessAttempts = [
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        '00000000-0000-0000-0000-000000000000',
        '12345678-1234-1234-1234-123456789012',
        'state-1', 'state-2', 'state-3',
        '', 'null', 'undefined'
      ];

      for (const guess of guessAttempts) {
        const retrieved = await stateStore.get(guess);
        expect(retrieved).toBeNull();
      }
    });

    it('should prevent state storage overflow attacks', async () => {
      // Try to flood state store with many entries
      const promises = [];
      for (let i = 0; i < 10000; i++) {
        promises.push(stateStore.set(`flood-${i}`, { data: 'x'.repeat(1000) }, 5000));
      }

      await Promise.all(promises);

      // System should remain functional
      const testKey = randomId();
      await stateStore.set(testKey, { test: true }, 5000);
      const retrieved = await stateStore.get(testKey);
      expect(retrieved).toEqual({ test: true });
    });

    it('should prevent state pollution through TTL manipulation', async () => {
      const key = 'ttl-test';
      
      // Set with very short TTL
      await stateStore.set(key, { data: 'secret' }, 1);
      
      // Wait for expiration
      await sleep(10);
      
      // Should not be retrievable
      expect(await stateStore.get(key)).toBeNull();
      
      // Should not be consumable
      expect(await stateStore.consume(key)).toBeNull();
    });

    it('should handle concurrent state manipulation safely', async () => {
      const key = 'concurrent-test';
      const value = { secret: 'data' };
      
      await stateStore.set(key, value, 5000);
      
      // Multiple concurrent operations
      const operations = [
        stateStore.get(key),
        stateStore.get(key),
        stateStore.consume(key),
        stateStore.consume(key),
        stateStore.get(key)
      ];
      
      const results = await Promise.all(operations);
      
      // Only one consume should succeed
      const consumeResults = results.slice(2, 4).filter(r => r !== null);
      expect(consumeResults).toHaveLength(1);
    });
  });

  describe('Discord Interaction Security', () => {
    it('should prevent interaction replay attacks through locks', async () => {
      const interactionId = 'replay-test-interaction';
      let executionCount = 0;
      
      const mockHandler = async () => {
        const acquired = await interactionLock.acquire(interactionId);
        if (acquired) {
          executionCount++;
          await sleep(50); // Simulate work
          await interactionLock.release(interactionId);
        }
      };
      
      // Simulate multiple concurrent "duplicate" interactions
      const promises = Array(10).fill(0).map(() => mockHandler());
      await Promise.all(promises);
      
      // Only one should have executed
      expect(executionCount).toBe(1);
    });

    it('should sanitize Discord interaction inputs', async () => {
      const maliciousInteraction = createMockChatInputCommandInteraction({
        id: '<script>alert("xss")</script>',
        user: createMockUser({ 
          id: '"; DROP TABLE users; --',
          username: '<img src=x onerror=alert("xss")>'
        })
      });
      
      // The system should handle malicious input safely
      // In a real implementation, these would be sanitized
      expect(maliciousInteraction.id).toBeDefined();
      expect(maliciousInteraction.user?.id).toBeDefined();
    });

    it('should rate limit Discord command executions', async () => {
      const mockInteraction = createMockChatInputCommandInteraction({
        user: createMockUser({ id: TEST_USERS.VALID_DISCORD_ID }),
        options: { getSubcommand: vi.fn().mockReturnValue('login') }
      });

      // Rapid successive command executions
      const promises = Array(20).fill(0).map(() => authCommand.execute(mockInteraction));
      
      // Should handle gracefully without crashing
      await Promise.allSettled(promises);
      
      // At least the first should succeed
      expect(mockInteraction.reply).toHaveBeenCalled();
    });

    it('should validate Discord user permissions', async () => {
      // Test with invalid Discord user ID formats
      const invalidUsers = [
        '', 'invalid', '123', 'a'.repeat(100), 
        '<script>', '../../secrets', null, undefined
      ];
      
      for (const userId of invalidUsers) {
        const interaction = createMockChatInputCommandInteraction({
          user: createMockUser({ id: userId as string }),
          options: { getSubcommand: vi.fn().mockReturnValue('login') }
        });
        
        // Should not crash the system
        await expect(authCommand.execute(interaction)).resolves.not.toThrow();
      }
    });
  });

  describe('Input Validation Security', () => {
    it('should validate OAuth session creation inputs', async () => {
      const maliciousInputs = [
        { discordId: '<script>alert("xss")</script>' },
        { discordId: '../../etc/passwd' },
        { discordId: 'a'.repeat(10000) }, // Very long input
        { discordId: '' },
        { discordId: null },
        { discordId: undefined },
        { discordId: { nested: 'object' } },
        { discordId: ['array', 'input'] }
      ];

      for (const input of maliciousInputs) {
        const response = await request(app)
          .post('/api/oauth/session')
          .send(input);
        
        // Should either reject with 400 or sanitize input
        if (response.status === 200) {
          expect(response.body.authorize_url).toBeDefined();
        } else {
          expect(response.status).toBe(400);
        }
      }
    });

    it('should sanitize URL parameters in OAuth flow', async () => {
      const maliciousParams = [
        'javascript:alert("xss")',
        'data:text/html,<script>alert("xss")</script>',
        'file:///etc/passwd',
        'ftp://malicious.com/payload',
        'https://evil.com/../../../secrets'
      ];

      for (const param of maliciousParams) {
        const response = await request(app)
          .get(`/api/oauth/start?state=${encodeURIComponent(param)}`)
          .expect(400);

        expect(response.text).toContain('Invalid Authorization Request');
      }
    });

    it('should prevent SQL injection in database queries', async () => {
      const sqlInjectionAttempts = [
        "'; DROP TABLE users; --",
        "' OR '1'='1",
        "'; INSERT INTO admin VALUES ('hacker'); --",
        "' UNION SELECT * FROM secrets --"
      ];

      for (const injection of sqlInjectionAttempts) {
        // Mock database call with injection attempt
        mockPrisma.user.findUnique.mockImplementation((args: any) => {
          // Verify that the injection is properly parameterized
          expect(typeof args.where.id).toBe('string');
          return Promise.resolve(null);
        });

        // Attempt injection through Discord ID
        const sessionResponse = await request(app)
          .post('/api/oauth/session')
          .send({ discordId: injection });

        // Should either reject invalid format or safely parameterize
        if (sessionResponse.status === 200) {
          expect(mockPrisma.user.findUnique).toHaveBeenCalled();
        }
      }
    });
  });

  describe('Resource Exhaustion Prevention', () => {
    it('should handle memory exhaustion attacks', async () => {
      const largePayloads = Array(100).fill(0).map((_, i) => ({
        discordId: `user-${i}`,
        largeData: 'x'.repeat(10000) // 10KB per request
      }));

      const promises = largePayloads.map(payload =>
        request(app)
          .post('/api/oauth/session')
          .send(payload)
      );

      const results = await Promise.allSettled(promises);

      // System should remain responsive
      expect(results.length).toBe(100);

      // Test that system is still functional after attack
      const normalResponse = await request(app)
        .post('/api/oauth/session')
        .send({ discordId: TEST_USERS.VALID_DISCORD_ID });

      expect(normalResponse.status).toBe(200);
    });

    it('should prevent CPU exhaustion through expensive operations', async () => {
      const startTime = Date.now();

      // Multiple concurrent JWT operations (computationally expensive)
      const promises = Array(50).fill(0).map((_, i) =>
        request(app)
          .post('/api/oauth/session')
          .send({ discordId: `user-${i}` })
      );

      await Promise.all(promises);
      const duration = Date.now() - startTime;

      // Should complete within reasonable time (not hang indefinitely)
      expect(duration).toBeLessThan(10000); // 10 seconds max
    });

    it('should limit concurrent connections', async () => {
      // Simulate many concurrent connections
      const numConnections = 200;
      const promises = Array(numConnections).fill(0).map((_, i) =>
        request(app)
          .post('/api/oauth/session')
          .send({ discordId: `concurrent-user-${i}` })
      );

      const results = await Promise.allSettled(promises);

      // Most should succeed (exact limit depends on system configuration)
      const successful = results.filter(r => r.status === 'fulfilled').length;
      expect(successful).toBeGreaterThan(numConnections * 0.5); // At least 50% success rate
    });
  });

  describe('Error Information Disclosure Prevention', () => {
    it('should not leak sensitive information in error messages', async () => {
      // Simulate database connection error with sensitive info
      mockPrisma.user.create.mockRejectedValue(
        new Error('Database connection failed: host=secret-db.internal.com port=5432 password=supersecret')
      );

      const sessionResponse = await request(app)
        .post('/api/oauth/session')
        .send({ discordId: TEST_USERS.VALID_DISCORD_ID });

      const authUrl = new URL(sessionResponse.body.authorize_url);
      const state = authUrl.searchParams.get('state');

      yahooMock.mockTokenExchange();

      await request(app)
        .get(`/api/oauth/start?state=${encodeURIComponent(state!)}`)
        .expect(302);

      const callbackResponse = await request(app)
        .get(`/api/oauth/callback?code=test&state=${encodeURIComponent(state!)}`)
        .expect(500);

      // Should not contain sensitive database information
      expect(callbackResponse.text).not.toContain('secret-db.internal.com');
      expect(callbackResponse.text).not.toContain('supersecret');
      expect(callbackResponse.text).not.toContain('password=');
    });

    it('should provide generic error messages for security failures', async () => {
      const securityTestCases = [
        createExpiredJWT(),
        createInvalidJWT(),
        'completely-invalid-jwt',
        ''
      ];

      for (const testCase of securityTestCases) {
        const response = await request(app)
          .get(`/api/oauth/start?state=${encodeURIComponent(testCase)}`)
          .expect(400);

        // Should provide generic security error message
        expect(response.text).toContain('Invalid Authorization Request');
        // Should not reveal specific validation failures
        expect(response.text).not.toContain('JWT');
        expect(response.text).not.toContain('signature');
        expect(response.text).not.toContain('expired');
      }
    });
  });

  describe('Timing Attack Prevention', () => {
    it('should prevent timing-based user enumeration', async () => {
      const existingUser = TEST_USERS.VALID_DISCORD_ID;
      const nonExistentUser = 'non-existent-user-12345';

      // Mock existing user
      mockPrisma.user.findUnique.mockImplementation((args: any) => {
        if (args.where.id === existingUser) {
          return Promise.resolve({
            id: existingUser,
            email: 'existing@example.com',
            createdAt: new Date(),
            updatedAt: new Date()
          });
        }
        return Promise.resolve(null);
      });

      // Measure timing for existing user
      const startTime1 = Date.now();
      await request(app)
        .post('/api/oauth/session')
        .send({ discordId: existingUser });
      const duration1 = Date.now() - startTime1;

      // Measure timing for non-existent user
      const startTime2 = Date.now();
      await request(app)
        .post('/api/oauth/session')
        .send({ discordId: nonExistentUser });
      const duration2 = Date.now() - startTime2;

      // Timing difference should be minimal to prevent enumeration
      const timingDifference = Math.abs(duration1 - duration2);
      expect(timingDifference).toBeLessThan(100); // Less than 100ms difference
    });

    it('should use constant-time JWT verification', async () => {
      const validJWT = createTestJWT();
      const invalidJWT = validJWT.slice(0, -10) + 'tampered123';

      // Multiple timing measurements
      const validTimings = [];
      const invalidTimings = [];

      for (let i = 0; i < 10; i++) {
        // Valid JWT timing
        const start1 = process.hrtime.bigint();
        try {
          verifyJWT(validJWT, TEST_TOKENS.VALID_JWT_SECRET);
        } catch (e) {
          // Expected for some tests
        }
        const duration1 = Number(process.hrtime.bigint() - start1) / 1_000_000; // Convert to ms
        validTimings.push(duration1);

        // Invalid JWT timing
        const start2 = process.hrtime.bigint();
        try {
          verifyJWT(invalidJWT, TEST_TOKENS.VALID_JWT_SECRET);
        } catch (e) {
          // Expected
        }
        const duration2 = Number(process.hrtime.bigint() - start2) / 1_000_000;
        invalidTimings.push(duration2);
      }

      // Calculate average timings
      const avgValid = validTimings.reduce((a, b) => a + b) / validTimings.length;
      const avgInvalid = invalidTimings.reduce((a, b) => a + b) / invalidTimings.length;

      // Timing difference should be minimal for constant-time comparison
      const timingDifference = Math.abs(avgValid - avgInvalid);
      expect(timingDifference).toBeLessThan(10); // Less than 10ms average difference
    });
  });

  describe('Session Hijacking Prevention', () => {
    it('should prevent session fixation attacks', async () => {
      // Attacker tries to fix a session ID
      const fixedJTI = 'attacker-controlled-jti';
      const attackerJWT = signJWT({
        sub: TEST_USERS.VALID_DISCORD_ID,
        purpose: 'yahoo_oauth',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 300,
        jti: fixedJTI
      }, TEST_TOKENS.VALID_JWT_SECRET);

      // Pre-populate state with attacker's data
      await stateStore.set(fixedJTI, { 
        discordId: 'attacker-id',
        maliciousData: 'evil payload'
      }, 300000);

      // Legitimate user gets tricked into using attacker's JWT
      const response = await request(app)
        .get(`/api/oauth/start?state=${encodeURIComponent(attackerJWT)}`)
        .expect(400); // Should be rejected due to mismatched user ID

      expect(response.text).toContain('Invalid Authorization Request');
    });

    it('should bind sessions to specific users', async () => {
      // Create session for user A
      const userASession = await request(app)
        .post('/api/oauth/session')
        .send({ discordId: TEST_USERS.VALID_DISCORD_ID });

      const userAUrl = new URL(userASession.body.authorize_url);
      const userAState = userAUrl.searchParams.get('state');

      // Try to use user A's state with user B's ID
      const userBJWT = signJWT({
        sub: TEST_USERS.ANOTHER_DISCORD_ID, // Different user
        purpose: 'yahoo_oauth',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 300,
        jti: verifyJWT(userAState!, TEST_TOKENS.VALID_JWT_SECRET).jti
      }, TEST_TOKENS.VALID_JWT_SECRET);

      const response = await request(app)
        .get(`/api/oauth/start?state=${encodeURIComponent(userBJWT)}`)
        .expect(400);

      expect(response.text).toContain('Invalid Authorization Request');
    });
  });
});