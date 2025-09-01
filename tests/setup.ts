import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { mockDeep, DeepMockProxy } from 'vitest-mock-extended';
import { PrismaClient } from '@prisma/client';

// Global test setup
beforeAll(async () => {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'file:./test.db';
  process.env.OAUTH_STATE_JWT_SECRET = 'test-jwt-secret-32-chars-long-key';
  process.env.JWT_SECRET = 'test-jwt-secret-32-chars-long-key';
  process.env.JWT_KID = 'test-kid';
  process.env.YAHOO_CLIENT_ID = 'test-yahoo-client-id';
  process.env.YAHOO_CLIENT_SECRET = 'test-yahoo-client-secret';
  process.env.YAHOO_REDIRECT_URI = 'http://localhost:3000/api/oauth/callback';
  process.env.DISCORD_TOKEN = 'test-discord-token';
  process.env.DISCORD_BOT_TOKEN = 'test-discord-token';
  process.env.DISCORD_CLIENT_ID = 'test-discord-client-id';
  process.env.ANTHROPIC_API_KEY = 'test-anthropic-api-key';
  process.env.ORCHESTRATOR_URL = 'http://localhost:3000';
});

afterAll(async () => {
  // Global cleanup
});

// Mock Prisma globally
export const mockPrisma = mockDeep<PrismaClient>();

beforeEach(() => {
  // Reset mocks before each test
  mockPrisma.$reset();
});

afterEach(() => {
  // Cleanup after each test
});

// Global test utilities
export const resetAllMocks = () => {
  mockPrisma.$reset();
};
export const TEST_USERS = {
  VALID_DISCORD_ID: '123456789012345678',
  ANOTHER_DISCORD_ID: '987654321098765432',
  INVALID_DISCORD_ID: 'invalid',
} as const;

export const TEST_TOKENS = {
  VALID_JWT_SECRET: 'test-jwt-secret-32-chars-long-key',
  EXPIRED_TOKEN: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkiLCJuYW1lIjoiSm9obiBEb2UiLCJpYXQiOjE1MTYyMzkwMjIsImV4cCI6MTUxNjIzOTAyMn0.invalid',
} as const;

export const TEST_YAHOO_TOKENS = {
  ACCESS_TOKEN: 'test-access-token',
  REFRESH_TOKEN: 'test-refresh-token',
  EXPIRES_IN: 3600,
} as const;