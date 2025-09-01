import { vi, expect } from 'vitest';
import { randomBytes } from 'crypto';
import { signJWT, verifyJWT } from '../../apps/orchestrator/src/utils/jwt';
import { TEST_TOKENS, TEST_USERS } from '../setup';

// JWT Test Helpers
export const createTestJWT = (payload: any = {}, secret: string = TEST_TOKENS.VALID_JWT_SECRET) => {
  const defaultPayload = {
    sub: TEST_USERS.VALID_DISCORD_ID,
    purpose: 'yahoo_oauth',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 300, // 5 minutes
    jti: randomBytes(16).toString('hex'),
  };

  return signJWT({ ...defaultPayload, ...payload }, secret);
};

export const createExpiredJWT = (payload: any = {}) => {
  const expiredPayload = {
    sub: TEST_USERS.VALID_DISCORD_ID,
    purpose: 'yahoo_oauth',
    iat: Math.floor(Date.now() / 1000) - 600, // 10 minutes ago
    exp: Math.floor(Date.now() / 1000) - 300, // 5 minutes ago (expired)
    jti: randomBytes(16).toString('hex'),
    ...payload,
  };

  return signJWT(expiredPayload, TEST_TOKENS.VALID_JWT_SECRET);
};

export const createInvalidJWT = () => {
  return 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.signature';
};

// State Store Test Helpers
export const createTestStateRecord = (discordId: string = TEST_USERS.VALID_DISCORD_ID) => ({
  discordId,
  createdAt: Date.now(),
});

// Database Test Helpers
export const createTestUser = (overrides: any = {}) => ({
  id: TEST_USERS.VALID_DISCORD_ID,
  email: `${TEST_USERS.VALID_DISCORD_ID}@example.com`,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

export const createTestDiscordUser = (overrides: any = {}) => ({
  discordId: TEST_USERS.VALID_DISCORD_ID,
  discordUsername: 'testuser',
  userId: TEST_USERS.VALID_DISCORD_ID,
  isAuthenticated: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

export const createTestYahooToken = (overrides: any = {}) => ({
  userId: TEST_USERS.VALID_DISCORD_ID,
  accessToken: 'test-access-token',
  refreshToken: 'test-refresh-token',
  expiresAt: new Date(Date.now() + 3600 * 1000), // 1 hour from now
  tokenType: 'bearer',
  scope: 'fspt-w',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

// HTTP Test Helpers
export const createMockRequest = (overrides: any = {}) => ({
  body: {},
  query: {},
  headers: {
    'content-type': 'application/json',
  },
  get: vi.fn((header: string) => {
    const headers: Record<string, string> = {
      'host': 'localhost:3000',
    };
    return headers[header.toLowerCase()];
  }),
  protocol: 'http',
  ...overrides,
});

export const createMockResponse = () => {
  const res: any = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    redirect: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
  };
  return res;
};

// Timing Helpers
export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const waitFor = async (condition: () => boolean | Promise<boolean>, timeout: number = 5000) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await condition()) {
      return true;
    }
    await sleep(10);
  }
  throw new Error(`Condition not met within ${timeout}ms`);
};

// Test Data Generators
export const generateRandomDiscordId = () => {
  // Discord IDs are 17-19 digit snowflakes
  return (BigInt('4194304') << BigInt('22')).toString();
};

export const generateRandomSessionId = () => {
  return randomBytes(16).toString('hex');
};

// Assertion Helpers
export const expectValidJWT = (token: string, secret: string = TEST_TOKENS.VALID_JWT_SECRET) => {
  expect(() => verifyJWT(token, secret)).not.toThrow();
  const payload = verifyJWT(token, secret);
  expect(payload).toHaveProperty('sub');
  expect(payload).toHaveProperty('iat');
  expect(payload).toHaveProperty('exp');
  return payload;
};

export const expectDiscordEphemeralResponse = (mockReply: any) => {
  expect(mockReply).toHaveBeenCalledWith(
    expect.objectContaining({
      flags: expect.any(Number), // Should use MessageFlags.Ephemeral
    })
  );
};

export const expectOAuthRedirectURL = (url: string) => {
  expect(url).toMatch(/^https:\/\/api\.login\.yahoo\.com\/oauth2\/request_auth/);
  expect(url).toContain('client_id=');
  expect(url).toContain('redirect_uri=');
  expect(url).toContain('response_type=code');
  expect(url).toContain('scope=fspt-w');
  expect(url).toContain('state=');
};

// Mock Environment Helpers
export const withTestEnv = (envVars: Record<string, string>, callback: () => void | Promise<void>) => {
  return async () => {
    const originalEnv = { ...process.env };
    Object.assign(process.env, envVars);
    
    try {
      await callback();
    } finally {
      process.env = originalEnv;
    }
  };
};

// Error Simulation Helpers
export const simulateNetworkError = () => {
  const error = new Error('Network Error');
  Object.assign(error, {
    code: 'ECONNREFUSED',
    errno: -61,
    syscall: 'connect',
  });
  return error;
};

export const simulateTimeoutError = () => {
  const error = new Error('Request Timeout');
  Object.assign(error, {
    code: 'ETIMEDOUT',
    timeout: 5000,
  });
  return error;
};