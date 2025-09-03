// Mock Prisma client for testing
import { vi } from 'vitest';

export const mockPrismaClient = {
  yahooToken: {
    findUnique: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
  },
  recommendation: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  signal: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  discordUser: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
  },
  league: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  $disconnect: vi.fn(),
};

// Mock database connection manager
vi.mock('../../db', () => ({
  prisma: mockPrismaClient,
  connectDatabase: vi.fn().mockResolvedValue(mockPrismaClient),
  disconnectDatabase: vi.fn().mockResolvedValue(undefined),
  getDatabaseHealth: vi.fn().mockResolvedValue({ healthy: true, latency: 50 }),
  directPrisma: vi.fn().mockReturnValue(mockPrismaClient),
}));

// Sample database records
export const mockYahooToken = {
  userId: 'test-user-1',
  accessToken: 'mock_access_token',
  refreshToken: 'mock_refresh_token',
  expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
  tokenType: 'Bearer',
  scope: 'fspt-w',
};

export const mockRecommendation = {
  id: 'rec_123',
  leagueId: '123456',
  type: 'WAIVER',
  summary: 'Add RB Handcuff',
  payload: {
    type: 'WAIVER',
    addPlayerId: 'nfl.p.12345',
    dropPlayerId: 'nfl.p.23456',
    fabBid: 15,
    confidence: 85,
    reason: 'Injury replacement',
  },
  confidence: 85,
  fabBid: 15,
  autoEligible: false,
  status: 'STAGED',
  createdAt: new Date(),
  executedAt: null,
  executionResult: null,
};

// Helper to setup common mock responses
export function setupPrismaMocks() {
  mockPrismaClient.yahooToken.findUnique.mockResolvedValue(mockYahooToken);
  mockPrismaClient.recommendation.create.mockResolvedValue(mockRecommendation);
  mockPrismaClient.recommendation.findUnique.mockResolvedValue(mockRecommendation);
  mockPrismaClient.recommendation.findMany.mockResolvedValue([mockRecommendation]);
  // Default return null for discordUser mapping (most tests don't need mapping)
  mockPrismaClient.discordUser.findUnique.mockResolvedValue(null);
  mockPrismaClient.user.findUnique.mockResolvedValue({
    id: 'test-user-1',
    email: 'test@example.com',
  });
  mockPrismaClient.league.findUnique.mockResolvedValue({ id: '123456', name: 'Test League' });
}

// Helper to reset all mocks
export function resetPrismaMocks() {
  vi.clearAllMocks();
}
