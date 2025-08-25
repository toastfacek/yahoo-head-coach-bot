import { Router } from 'express';
import { healthCheck } from './health';
import { dailyReport } from './reports';
import { oauthStart, oauthCallback, tokenStatus, refreshNow } from './oauth';
import { checkLineup } from './lineup';
import { runWaivers } from './waivers';
import { listPending, approve, reject } from './approvals';

const router = Router();

// Health check endpoint
router.get('/health', healthCheck);

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

// Root endpoint
router.get('/', (req, res) => {
  res.json({
    message: 'Yahoo Fantasy Football HeadCoach API',
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
      approvals: {
        pending: '/approvals/pending',
        approve: '/approvals/approve',
        reject: '/approvals/reject'
      }
    }
  });
});

export default router;
