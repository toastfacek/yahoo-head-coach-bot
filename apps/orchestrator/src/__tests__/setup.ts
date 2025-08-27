// Test setup and configuration
import { beforeEach, vi } from 'vitest';

// Mock environment variables for testing - must be set before any modules load
Object.assign(process.env, {
  NODE_ENV: 'test',
  YAHOO_CLIENT_ID: 'test_client_id',
  YAHOO_CLIENT_SECRET: 'test_client_secret', 
  YAHOO_REDIRECT_URI: 'http://localhost:3000/api/oauth/callback',
  ANTHROPIC_API_KEY: 'test_anthropic_key',
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  EXECUTION_MODE: 'dry-run'
});

// Reset mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
});