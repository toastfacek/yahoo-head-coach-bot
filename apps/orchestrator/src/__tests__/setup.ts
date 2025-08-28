// Test setup and configuration
import { beforeAll, afterAll, beforeEach, vi } from 'vitest';

// Mock environment variables for testing - must be set before any modules load
Object.assign(process.env, {
  NODE_ENV: 'test',
  YAHOO_CLIENT_ID: 'test_client_id',
  YAHOO_CLIENT_SECRET: 'test_client_secret',
  YAHOO_REDIRECT_URI: 'http://localhost:3000/api/oauth/callback',
  ANTHROPIC_API_KEY: 'test_anthropic_key',
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  EXECUTION_MODE: 'dry-run',
});

// Import Prisma mock to ensure it's set up before any database imports
import './mocks/prisma.mock';

// Import mocked database functions (will be mocked by prisma.mock.ts)
import { connectDatabase, disconnectDatabase } from '../db';

// Database setup and teardown
beforeAll(async () => {
  // Mock database connection for all tests
  try {
    await connectDatabase();
    console.log('🧪 Test database connection established');
  } catch (error) {
    console.error('❌ Test database setup failed:', error);
  }
});

afterAll(async () => {
  // Clean up test resources
  try {
    await disconnectDatabase();
    console.log('🧪 Test database connection closed');
  } catch (error) {
    console.error('❌ Test cleanup failed:', error);
  }
  vi.clearAllMocks();
});

// Reset mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
});

// Block real network calls via axios by default in tests.
// Tests can override specific calls by mocking axios per-suite when needed.
vi.mock('axios', () => {
  const mockReject = () => Promise.reject(new Error('Network error'));
  const instance = {
    get: vi.fn(mockReject),
    post: vi.fn(mockReject),
    put: vi.fn(mockReject),
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
    request: vi.fn(mockReject),
  } as any;
  return {
    default: {
      create: vi.fn(() => instance),
      get: vi.fn(mockReject),
      post: vi.fn(mockReject),
      put: vi.fn(mockReject),
    },
  };
});
