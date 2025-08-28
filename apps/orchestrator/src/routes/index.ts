import { Router } from 'express';
import { healthCheck } from './health';
import { dailyReport } from './reports';
import { oauthStart, oauthCallback, tokenStatus, refreshNow } from './oauth';
import { checkLineup } from './lineup';
import { runWaivers } from './waivers';
import { listPending, approve, reject } from './approvals';
import { weeklySummary } from './memory';
import { hourly } from './scheduler';
import { handleChat, getChatHistory } from './chat';
import { getLeagues } from './leagues';
import { getTeamStats } from './teams';
import { getTeamRoster } from './roster';

const router = Router();

// Root endpoint for basic connectivity check
router.get('/', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    service: 'orchestrator',
    message: 'Yahoo Fantasy HeadCoach API is running'
  });
});

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

// Memory endpoints
router.get('/memory/weekly', weeklySummary);

// Chat endpoints
router.post('/chat', handleChat);
router.get('/chat/history', getChatHistory);

// Yahoo Fantasy API endpoints
router.get('/leagues', getLeagues);
router.get('/team/stats', getTeamStats);
router.get('/team/roster', getTeamRoster);

// Root endpoint
router.get('/', (req, res) => {
  res.status(200).json({
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
      scheduler: {
        hourly: '/scheduler/hourly'
      },
      memory: {
        weekly: '/memory/weekly'
      },
      approvals: {
        pending: '/approvals/pending',
        approve: '/approvals/approve',
        reject: '/approvals/reject'
      },
      chat: {
        send: '/chat',
        history: '/chat/history'
      }
    }
  });
});

export default router;
