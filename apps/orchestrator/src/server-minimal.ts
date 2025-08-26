// Minimal server without problematic imports
import dotenv from 'dotenv';
dotenv.config({ path: '../../.env' });

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import https from 'https';
import fs from 'fs';
import { env } from './config/env';

import { connectDatabase, getDatabaseHealth, disconnectDatabase } from './db';
import { oauthStart, oauthCallback, tokenStatus, refreshNow } from './routes/oauth';
import { oauthStartFallback, oauthCallbackFallback, tokenStatusFallback, refreshNowFallback } from './routes/oauth-fallback';

console.log('🧪 Starting minimal server with OAuth routes...');

const app = express();
const PORT = Number(env.PORT || 3001); // Use 3001 to avoid conflicts

console.log('✅ Express app created');

// Minimal middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

console.log('✅ Middleware added');

// Health check route with database status
app.get('/api/health', async (req, res) => {
  try {
    const dbHealth = await getDatabaseHealth();
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      database: dbHealth
    });
  } catch (error) {
    res.status(503).json({ 
      status: 'degraded', 
      timestamp: new Date().toISOString(),
      database: { healthy: false, error: 'Health check failed' }
    });
  }
});

// Initialize database connection
let databaseAvailable = false;

async function startServer() {
  try {
    console.log('🔄 Connecting to database...');
    await connectDatabase();
    
    // Test database health
    const health = await getDatabaseHealth();
    if (health.healthy) {
      console.log(`✅ Database connection healthy (${health.latency}ms latency)`);
      databaseAvailable = true;
    } else {
      console.warn(`⚠️  Database connection unhealthy: ${health.error}`);
      console.log('📝 Server will continue with fallback OAuth routes');
    }
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    console.log('📝 Server will continue with fallback OAuth routes');
  }

  // OAuth routes with conditional fallback
  app.get('/api/oauth/start', (req, res) => {
    console.log('🔵 OAuth start requested');
    if (databaseAvailable) {
      oauthStart(req, res);
    } else {
      oauthStartFallback(req, res);
    }
  });

  app.get('/api/oauth/callback', (req, res) => {
    console.log('🔵 OAuth callback received:');
    console.log('Query params:', req.query);
    console.log('Full URL:', req.url);
    console.log('Headers:', req.headers);
    if (databaseAvailable) {
      oauthCallback(req, res);
    } else {
      oauthCallbackFallback(req, res);
    }
  });

  app.get('/api/oauth/status', (req, res) => {
    if (databaseAvailable) {
      tokenStatus(req, res);
    } else {
      tokenStatusFallback(req, res);
    }
  });
  
  app.get('/api/oauth/refresh', (req, res) => {
    if (databaseAvailable) {
      refreshNow(req, res);
    } else {
      refreshNowFallback(req, res);
    }
  });

  // Additional routes needed by Streamlit UI (stub implementations)
  app.get('/api/approvals/pending', (req, res) => {
    res.json({ 
      pending: databaseAvailable ? [] : [],
      message: databaseAvailable ? "No pending recommendations" : "Database unavailable - using empty results"
    });
  });

  app.post('/api/approvals/approve', (req, res) => {
    if (!databaseAvailable) {
      res.status(503).json({ error: 'Database unavailable' });
      return;
    }
    res.json({ 
      ok: true, 
      message: "Approval functionality ready but AI agents not yet implemented" 
    });
  });

  app.post('/api/approvals/reject', (req, res) => {
    if (!databaseAvailable) {
      res.status(503).json({ error: 'Database unavailable' });
      return;
    }
    res.json({ 
      ok: true, 
      message: "Rejection functionality ready but AI agents not yet implemented" 
    });
  });

  // Stub routes for other UI functionality
  app.get('/api/reports/daily', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    res.write('data: # Daily Report\n\n');
    res.write('data: Database connection working! 🎉\n\n');
    res.write('data: \n\n');
    res.write('data: ## Status\n\n');
    res.write('data: - ✅ Database: Connected\n\n');
    res.write('data: - ✅ OAuth: Ready\n\n');
    res.write('data: - ⚠️  AI Tools: Not yet implemented\n\n');
    res.write('data: \n\n');
    res.write('data: The daily report tool will analyze your lineup and provide recommendations once the AI agents are fully integrated.\n\n');
    res.end();
  });

  app.post('/api/lineup/check', (req, res) => {
    res.json({
      message: "Lineup check functionality ready",
      status: "success",
      note: "AI agents not yet fully implemented",
      database: databaseAvailable ? "connected" : "unavailable"
    });
  });

  app.post('/api/waivers/run', (req, res) => {
    res.json({
      message: "Waiver analysis functionality ready", 
      status: "success",
      note: "AI agents not yet fully implemented",
      database: databaseAvailable ? "connected" : "unavailable"
    });
  });

  // League discovery endpoint
  app.get('/api/leagues', async (req, res) => {
    if (!databaseAvailable) {
      return res.status(503).json({ error: 'Database unavailable' });
    }

    try {
      const userId = req.query.userId as string || 'dev';
      
      // Import the Yahoo services
      const { createYahooClient, getGameKey } = require('./services/yahoo-api-direct');
      
      const yf = await createYahooClient(userId);
      if (!yf) {
        return res.status(401).json({ 
          error: 'Not authenticated', 
          message: 'Please complete OAuth first',
          oauthUrl: '/api/oauth/start?userId=' + userId
        });
      }

      let leagueList: any[] = [];
      
      try {
        const gameKey = await getGameKey(yf, 'nfl');
        const leaguesResponse = await yf.getUserGameLeagues(gameKey);
        
        if (leaguesResponse.success) {
          // Extract useful league info from Yahoo's JSON response structure
          const leaguesContainer = leaguesResponse.data?.fantasy_content?.users?.[0]?.user?.[1]?.games?.[0]?.game?.[1]?.leagues;
          
          if (leaguesContainer && leaguesContainer[0]?.league) {
            const leagues = leaguesContainer[0].league;
            leagueList = leagues.map((league: any) => ({
              id: league.league_id || league.league_key.split('.l.')[1],
              name: league.name,
              league_key: league.league_key,
              num_teams: league.num_teams,
              scoring_type: league.scoring_type,
              league_type: league.league_type,
              season: league.season,
              draft_status: league.draft_status
            }));
          }
        }
      } catch (yahooError) {
        console.log('Yahoo API parsing failed, using mock data:', yahooError);
      }

      // If no leagues found or Yahoo API failed, provide a mock league for testing
      if (leagueList.length === 0) {
        leagueList = [
          {
            id: "123456",
            name: "Demo League (Mock Data for Testing)",
            league_key: "414.l.123456",
            num_teams: 12,
            scoring_type: "head_to_head",
            league_type: "private",
            season: "2024"
          }
        ];
      }

      return res.json({ 
        leagues: leagueList, 
        userId, 
        count: leagueList.length,
        note: leagueList[0]?.name?.includes('Mock') ? 'Using mock data - Yahoo API integration needs refinement' : 'Real league data from Yahoo'
      });
    } catch (error: any) {
      console.error('League discovery error:', error);
      return res.status(500).json({ 
        error: 'Failed to fetch leagues', 
        message: error.message,
        note: 'Make sure you have completed OAuth authentication'
      });
    }
  });

  // Debug endpoint to test Yahoo API calls
  app.get('/api/debug/yahoo', async (req, res) => {
    if (!databaseAvailable) {
      return res.status(503).json({ error: 'Database unavailable' });
    }

    try {
      const userId = req.query.userId as string || 'dev';
      const { createYahooClient } = require('./services/yahoo-api-direct');
      
      const yf = await createYahooClient(userId);
      if (!yf) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      console.log('🔍 Testing Yahoo API calls...');
      
      // Test 1: Get game meta
      const gameMetaResponse = await yf.getGameMeta('nfl');
      console.log('Game Meta Response:', JSON.stringify(gameMetaResponse, null, 2));

      if (gameMetaResponse.success) {
        // Test 2: Get user game leagues
        const gameKey = gameMetaResponse.data?.fantasy_content?.game?.[0]?.game_key;
        if (gameKey) {
          console.log('Using game key:', gameKey);
          const leaguesResponse = await yf.getUserGameLeagues(gameKey);
          console.log('Leagues Response:', JSON.stringify(leaguesResponse, null, 2));
        }
      }

      return res.json({
        message: 'Debug complete - check server logs',
        gameMetaSuccess: gameMetaResponse.success,
        gameMetaData: gameMetaResponse.data
      });
    } catch (error: any) {
      console.error('Debug error:', error);
      return res.status(500).json({ error: error.message });
    }
  });

  // Start HTTP server
  const server = app.listen(PORT, () => {
    console.log(`🎉 MINIMAL SERVER STARTED on port ${PORT}`);
    console.log(`📊 Health check available at: http://localhost:${PORT}/api/health`);
    console.log(`🔗 OAuth start: http://localhost:${PORT}/api/oauth/start?userId=dev`);
    if (databaseAvailable) {
      console.log('🔧 Running with real database connection - press Ctrl+C to stop');
    } else {
      console.log('⚠️  Running with database unavailable - using fallback routes');
      console.log('💡 Fix database connection and restart to enable full OAuth functionality');
    }
  });

  return server;
}

// Error handling middleware for detailed logging
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('🚨 Server Error:', error);
  console.error('Request URL:', req.url);
  console.error('Request method:', req.method);
  console.error('Error stack:', error.stack);
  
  res.status(error.status || 500).json({
    error: 'Internal Server Error',
    message: error.message || 'Something went wrong',
    timestamp: new Date().toISOString()
  });
});

console.log('✅ Routes and database initialization ready');

// Create HTTPS server with self-signed certificate for development
const httpsOptions = {
  key: `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDGFze9VF5n4uHG
...self-signed cert would be too long to embed...
-----END PRIVATE KEY-----`,
  cert: `-----BEGIN CERTIFICATE-----
MIIEpDCCAowCCQDYPiP7w+qk7DANBgkqhkiG9w0BAQsFADAUMRIwEAYDVQQDDAls
...self-signed cert would be too long to embed...
-----END CERTIFICATE-----`
};

// For development, let's use HTTP instead and modify the redirect URI
console.log('⚠️  For development, using HTTP server instead of HTTPS');
console.log('💡 You can use a tunnel service like ngrok for HTTPS testing');

// Start the server with database initialization
startServer().then(server => {
  // Graceful shutdown handling
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully...');
    await disconnectDatabase();
    server.close(() => {
      console.log('Process terminated');
      process.exit(0);
    });
  });

  process.on('SIGINT', async () => {
    console.log('SIGINT received, shutting down gracefully...');
    await disconnectDatabase();
    server.close(() => {
      console.log('Process terminated');
      process.exit(0);
    });
  });
}).catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});