// Mock database layer to test server startup without Prisma connection issues

const mockYahooToken = {
  userId: 'dev',
  accessToken: 'mock_access_token',
  refreshToken: 'mock_refresh_token',
  expiresAt: new Date(Date.now() + 3600000),
  tokenType: 'Bearer',
  scope: 'fspt-w',
};

const mockRecommendation = {
  id: 'mock_rec_123',
  leagueId: '123456',
  type: 'WAIVER',
  summary: 'Mock recommendation',
  payload: { type: 'WAIVER', mock: true },
  confidence: 85,
  fabBid: 10,
  autoEligible: false,
  status: 'STAGED',
  createdAt: new Date(),
  executedAt: null,
  executionResult: null,
};

// Mock Prisma client
export const prisma = {
  yahooToken: {
    findUnique: async ({ where: _where }: any) => {
      console.log('🔧 Mock: yahooToken.findUnique called');
      return where.userId === 'dev' ? mockYahooToken : null;
    },
    update: async ({ where: _where, data }: any) => {
      console.log('🔧 Mock: yahooToken.update called');
      return { ...mockYahooToken, ...data };
    },
    create: async (data: any) => {
      console.log('🔧 Mock: yahooToken.create called');
      return { ...mockYahooToken, ...data.data };
    },
    upsert: async ({ where: _where, update, create }: any) => {
      console.log('🔧 Mock: yahooToken.upsert called');
      // Mock successful upsert operation
      return { ...mockYahooToken, ...update, ...create };
    },
  },

  recommendation: {
    findMany: async ({ where: _where, orderBy: _orderBy }: any) => {
      console.log('🔧 Mock: recommendation.findMany called');
      return [mockRecommendation];
    },
    findUnique: async ({ where: _where }: any) => {
      console.log('🔧 Mock: recommendation.findUnique called');
      return mockRecommendation;
    },
    create: async ({ data }: any) => {
      console.log('🔧 Mock: recommendation.create called');
      return { ...mockRecommendation, ...data };
    },
    update: async ({ where: _where, data }: any) => {
      console.log('🔧 Mock: recommendation.update called');
      return { ...mockRecommendation, ...data };
    },
  },

  signal: {
    create: async ({ data }: any) => {
      console.log('🔧 Mock: signal.create called');
      return { id: 'mock_signal_123', ...data };
    },
    findMany: async ({ where: _where }: any) => {
      console.log('🔧 Mock: signal.findMany called');
      return [];
    },
  },

  user: {
    findUnique: async ({ where: _where }: any) => {
      console.log('🔧 Mock: user.findUnique called');
      return { id: 'dev', email: 'dev@test.com' };
    },
    create: async ({ data }: any) => {
      console.log('🔧 Mock: user.create called');
      return { id: 'mock_user', ...data };
    },
  },

  league: {
    findUnique: async ({ where: _where }: any) => {
      console.log('🔧 Mock: league.findUnique called');
      return { id: '123456', name: 'Mock League' };
    },
  },

  $disconnect: async () => {
    console.log('🔧 Mock: $disconnect called');
  },

  $queryRaw: async (_query: any) => {
    console.log('🔧 Mock: $queryRaw called');
    return [{ test: 1 }];
  },
};
