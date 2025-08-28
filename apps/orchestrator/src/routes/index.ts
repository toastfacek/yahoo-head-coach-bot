import { Router } from 'express';
import { healthCheck } from './health';
import { dailyReport } from './reports';
import { oauthStart, oauthCallback, tokenStatus, refreshNow } from './oauth';
import { checkLineup } from './lineup';
import { runWaivers } from './waivers';
import { listPending, approve, reject } from './approvals';
import { hourly } from './scheduler';
import { handleChat } from './chat';

const router = Router();

// Health check endpoints (both paths for flexibility)
router.get('/health', healthCheck);
router.get('/api/health', healthCheck);

// OAuth endpoints
router.get('/oauth/start', oauthStart);
router.get('/oauth/callback', oauthCallback);
router.get('/oauth/status', tokenStatus);
router.get('/oauth/refresh', refreshNow);

// Reports endpoints
router.get('/reports/daily', dailyReport);

// Action endpoints
router.post('/lineup/check', checkLineup);
router.post('/waivers/run', runWaivers);

// Approval endpoints
router.get('/approvals/pending', listPending);
router.post('/approvals/approve', approve);
router.post('/approvals/reject', reject);

// Scheduler endpoint (hourly cron target)
router.get('/scheduler/hourly', hourly);

// Chat endpoints
router.post('/chat', handleChat);

// Root endpoint
router.get('/', (req, res) => {
  res.status(200).json({
    message: 'Yahoo Fantasy Football HeadCoach API - Discord Bot Backend',
    version: process.env.npm_package_version || '1.0.0',
    endpoints: {
      health: '/health',
      oauth: {
        start: '/oauth/start',
        callback: '/oauth/callback'
      },
      reports: '/reports/daily',
      lineup: '/lineup/check',
      waivers: '/waivers/run',
      scheduler: {
        hourly: '/scheduler/hourly'
      },
      approvals: {
        pending: '/approvals/pending',
        approve: '/approvals/approve',
        reject: '/approvals/reject'
      },
      chat: {
        send: '/chat'
      }
    }
  });
});

export default router;
