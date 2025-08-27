import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { listPending, approve, reject } from '../approvals';

// Create a test app
function createTestApp() {
  const app = express();
  app.use(express.json());
  
  app.get('/approvals/pending', listPending);
  app.post('/approvals/approve', approve);
  app.post('/approvals/reject', reject);
  
  return app;
}

// Mock the database
vi.mock('../../db', () => ({
  prisma: {
    recommendation: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn()
    }
  }
}));

// Mock the Yahoo service
vi.mock('../../services/yahoo', () => ({
  yfForUser: vi.fn(),
  getGameKey: vi.fn().mockResolvedValue('431'),
  leagueKeyFor: vi.fn().mockReturnValue('431.l.123456'),
  userTeamKey: vi.fn().mockResolvedValue('431.l.123456.t.1'),
  callYahoo: vi.fn()
}));

describe('Approvals API Routes', () => {
  let app: express.Application;
  let mockPrisma: any;
  let mockYahooService: any;

  beforeEach(() => {
    app = createTestApp();
    mockPrisma = require('../../db').prisma;
    mockYahooService = require('../../services/yahoo');
    vi.clearAllMocks();
  });

  describe('GET /approvals/pending', () => {
    it('returns pending recommendations for valid league ID', async () => {
      const mockRecommendations = [
        {
          id: 'rec_1',
          leagueId: '123456',
          type: 'WAIVER',
          summary: 'Add RB Handcuff',
          status: 'STAGED',
          confidence: 85,
          createdAt: new Date()
        },
        {
          id: 'rec_2', 
          leagueId: '123456',
          type: 'LINEUP_SWAP',
          summary: 'Bench injured player',
          status: 'STAGED',
          confidence: 90,
          createdAt: new Date()
        }
      ];

      mockPrisma.recommendation.findMany.mockResolvedValue(mockRecommendations);

      const response = await request(app)
        .get('/approvals/pending')
        .query({ leagueId: '123456' });

      expect(response.status).toBe(200);
      expect(response.body.pending).toHaveLength(2);
      expect(response.body.pending[0].id).toBe('rec_1');
      
      expect(mockPrisma.recommendation.findMany).toHaveBeenCalledWith({
        where: { leagueId: '123456', status: 'STAGED' },
        orderBy: { createdAt: 'desc' }
      });
    });

    it('returns 400 for missing league ID', async () => {
      const response = await request(app)
        .get('/approvals/pending');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid query');
    });

    it('returns 400 for empty league ID', async () => {
      const response = await request(app)
        .get('/approvals/pending')
        .query({ leagueId: '' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid query');
    });

    it('returns empty array when no pending recommendations', async () => {
      mockPrisma.recommendation.findMany.mockResolvedValue([]);

      const response = await request(app)
        .get('/approvals/pending')
        .query({ leagueId: '123456' });

      expect(response.status).toBe(200);
      expect(response.body.pending).toHaveLength(0);
    });
  });

  describe('POST /approvals/approve', () => {
    const mockRecommendation = {
      id: 'rec_123',
      leagueId: '123456',
      type: 'WAIVER',
      status: 'STAGED',
      payload: {
        type: 'WAIVER',
        addPlayerId: 'nfl.p.12345',
        dropPlayerId: 'nfl.p.23456',
        fabBid: 15
      }
    };

    it('successfully executes approved recommendation', async () => {
      mockPrisma.recommendation.findUnique.mockResolvedValue(mockRecommendation);
      mockYahooService.callYahoo.mockResolvedValue({ 
        success: true, 
        transactionId: 'trans_123' 
      });

      const response = await request(app)
        .post('/approvals/approve')
        .send({ id: 'rec_123', userId: 'test-user' });

      expect(response.status).toBe(200);
      expect(response.body.ok).toBe(true);
      expect(response.body.result.success).toBe(true);

      expect(mockPrisma.recommendation.update).toHaveBeenCalledWith({
        where: { id: 'rec_123' },
        data: {
          status: 'EXECUTED',
          executedAt: expect.any(Date),
          executionResult: { success: true, transactionId: 'trans_123' }
        }
      });
    });

    it('returns 400 for invalid request body', async () => {
      const response = await request(app)
        .post('/approvals/approve')
        .send({}); // Missing required id

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid body');
    });

    it('returns 404 for non-existent recommendation', async () => {
      mockPrisma.recommendation.findUnique.mockResolvedValue(null);

      const response = await request(app)
        .post('/approvals/approve')
        .send({ id: 'nonexistent' });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Not found');
    });

    it('returns 400 for recommendation not in STAGED status', async () => {
      const executedRecommendation = {
        ...mockRecommendation,
        status: 'EXECUTED'
      };
      mockPrisma.recommendation.findUnique.mockResolvedValue(executedRecommendation);

      const response = await request(app)
        .post('/approvals/approve')
        .send({ id: 'rec_123' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Recommendation is not staged for approval');
    });

    it('handles Yahoo API execution failure', async () => {
      mockPrisma.recommendation.findUnique.mockResolvedValue(mockRecommendation);
      mockYahooService.callYahoo.mockResolvedValue({ 
        success: false, 
        reason: 'TRANSACTION_FAILED' 
      });

      const response = await request(app)
        .post('/approvals/approve')
        .send({ id: 'rec_123' });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Yahoo API execution failed');
      expect(response.body.reason).toBe('TRANSACTION_FAILED');

      // Should still update the recommendation with execution result
      expect(mockPrisma.recommendation.update).toHaveBeenCalledWith({
        where: { id: 'rec_123' },
        data: {
          executionResult: { success: false, reason: 'TRANSACTION_FAILED' }
        }
      });
    });

    it('handles missing team key error', async () => {
      mockPrisma.recommendation.findUnique.mockResolvedValue(mockRecommendation);
      mockYahooService.userTeamKey.mockResolvedValue(null);

      const response = await request(app)
        .post('/approvals/approve')
        .send({ id: 'rec_123' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Could not find team key for user in league');
    });

    it('uses default userId when not provided', async () => {
      mockPrisma.recommendation.findUnique.mockResolvedValue(mockRecommendation);
      mockYahooService.callYahoo.mockResolvedValue({ success: true });

      const response = await request(app)
        .post('/approvals/approve')
        .send({ id: 'rec_123' }); // No userId provided

      expect(response.status).toBe(200);
      expect(mockYahooService.yfForUser).toHaveBeenCalledWith('dev');
    });
  });

  describe('POST /approvals/reject', () => {
    it('successfully rejects recommendation', async () => {
      const response = await request(app)
        .post('/approvals/reject')
        .send({ id: 'rec_123' });

      expect(response.status).toBe(200);
      expect(response.body.ok).toBe(true);

      expect(mockPrisma.recommendation.update).toHaveBeenCalledWith({
        where: { id: 'rec_123' },
        data: { status: 'REJECTED' }
      });
    });

    it('returns 400 for invalid request body', async () => {
      const response = await request(app)
        .post('/approvals/reject')
        .send({}); // Missing required id

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid body');
    });

    it('returns 400 for empty id', async () => {
      const response = await request(app)
        .post('/approvals/reject')
        .send({ id: '' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid body');
    });
  });

  describe('error handling', () => {
    it('handles database connection errors', async () => {
      mockPrisma.recommendation.findMany.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/approvals/pending')
        .query({ leagueId: '123456' });

      expect(response.status).toBe(500);
    });

    it('handles Yahoo service errors gracefully', async () => {
      const mockRecommendation = {
        id: 'rec_123',
        leagueId: '123456', 
        status: 'STAGED',
        payload: { type: 'WAIVER' }
      };
      
      mockPrisma.recommendation.findUnique.mockResolvedValue(mockRecommendation);
      mockYahooService.yfForUser.mockRejectedValue(new Error('Yahoo service error'));

      const response = await request(app)
        .post('/approvals/approve')
        .send({ id: 'rec_123' });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Execution error');
      expect(response.body.message).toBe('Yahoo service error');
    });
  });
});