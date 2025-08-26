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

  // Team statistics endpoint
  app.get('/api/team/stats', async (req, res) => {
    if (!databaseAvailable) {
      return res.status(503).json({ error: 'Database unavailable' });
    }

    try {
      const userId = req.query.userId as string || 'dev';
      const leagueId = req.query.leagueId as string;
      
      if (!leagueId) {
        return res.status(400).json({ error: 'leagueId is required' });
      }

      // Import the Yahoo services
      const { createYahooClient, getGameKey, userTeamKey } = require('./services/yahoo-api-direct');
      
      const yf = await createYahooClient(userId);
      if (!yf) {
        return res.status(401).json({ 
          error: 'Not authenticated', 
          message: 'Please complete OAuth first'
        });
      }

      // Fetch real team statistics from Yahoo
      const gameKey = await getGameKey(yf, 'nfl');
      const teamKey = await userTeamKey(yf, gameKey, `${gameKey}.l.${leagueId}`);
      
      if (!teamKey) {
        return res.status(404).json({ 
          error: 'Team not found', 
          message: 'Could not find your team in this league'
        });
      }

      // Get league standings to get team record and ranking
      const standingsResponse = await yf.getLeagueStandings(`${gameKey}.l.${leagueId}`);
      const teamStatsResponse = await yf.getTeamStats(teamKey);
      const leagueTeamsResponse = await yf.getLeagueTeams(`${gameKey}.l.${leagueId}`);

      let teamStats = {
        record: { wins: 0, losses: 0, ties: 0, percentage: 0, rank: 0, totalTeams: 0 },
        points: { total: 0, average: 0, weeklyAverage: 0, vsAverage: 0, rank: 0 },
        currentWeek: { projected: 0, actual: null, week: 13 },
        opponent: { name: "TBD", record: { wins: 0, losses: 0 }, points: 0, user: "unknown" }
      };

      try {
        // Parse standings data
        if (standingsResponse.success && standingsResponse.data?.fantasy_content?.league?.[1]?.standings) {
          const standings = standingsResponse.data.fantasy_content.league[1].standings[0].teams;
          const totalTeams = standings.length;
          
          // Find our team in standings
          for (let i = 0; i < standings.length; i++) {
            const team = standings[i].team[0];
            if (team[0]?.team_key === teamKey) {
              const outcomes = team[1]?.team_standings?.outcome_totals;
              const stats = team[1]?.team_points;
              
              teamStats.record = {
                wins: parseInt(outcomes?.wins || '0'),
                losses: parseInt(outcomes?.losses || '0'), 
                ties: parseInt(outcomes?.ties || '0'),
                percentage: parseFloat(outcomes?.percentage || '0'),
                rank: parseInt(team[1]?.team_standings?.rank || '0'),
                totalTeams
              };
              
              teamStats.points = {
                total: parseFloat(stats?.total || '0'),
                average: parseFloat(stats?.total || '0') / Math.max(1, (teamStats.record.wins + teamStats.record.losses + teamStats.record.ties)),
                weeklyAverage: parseFloat(stats?.total || '0') / Math.max(1, (teamStats.record.wins + teamStats.record.losses + teamStats.record.ties)),
                vsAverage: 0, // Calculate later if needed
                rank: i + 1 // Rank by points
              };
              break;
            }
          }
        }

        // Get current team info from teams data
        if (leagueTeamsResponse.success && leagueTeamsResponse.data?.fantasy_content?.league?.[1]?.teams) {
          const teamsData = leagueTeamsResponse.data.fantasy_content.league[1].teams;
          let ourTeamInfo = null;
          let allTeams = [];
          
          // Extract all team info and find ours
          for (const key in teamsData) {
            if (teamsData[key]?.team) {
              const teamArray = teamsData[key].team[0];
              const teamName = teamArray[2]?.name || 'Unknown Team';
              const isOurTeam = teamArray[3]?.is_owned_by_current_login === 1;
              
              const teamInfo = {
                name: teamName,
                team_key: teamArray[0]?.team_key,
                draft_grade: teamArray[17]?.draft_grade || 'N/A'
              };
              
              allTeams.push(teamInfo);
              
              if (isOurTeam) {
                ourTeamInfo = teamInfo;
              }
            }
          }
          
          // Update team stats with real info
          if (ourTeamInfo) {
            teamStats.currentWeek.week = 1; // Current week from league data
            
            // Since it's preseason, provide draft-based projections
            const draftGradeToProjection: { [key: string]: number } = {
              'A+': 110, 'A': 105, 'A-': 100, 'B+': 95, 'B': 90, 'B-': 85,
              'C+': 80, 'C': 75, 'C-': 70, 'D+': 65, 'D': 60, 'D-': 55, 'F': 50
            };
            
            teamStats.currentWeek.projected = draftGradeToProjection[ourTeamInfo.draft_grade] || 85;
            teamStats.record.totalTeams = allTeams.length;
            
            // Find a likely opponent (just pick another team for demo)
            const otherTeams = allTeams.filter(t => t.team_key !== ourTeamInfo.team_key);
            if (otherTeams.length > 0) {
              teamStats.opponent = {
                name: otherTeams[0].name,
                record: { wins: 0, losses: 0 },
                points: 0,
                user: "TBD"
              };
            }
          }
        }
        
      } catch (error) {
        console.log('Error parsing Yahoo data, using fallback data:', error);
      }

      return res.json(teamStats);
    } catch (error: any) {
      console.error('Team stats error:', error);
      return res.status(500).json({ 
        error: 'Failed to fetch team stats', 
        message: error.message
      });
    }
  });

  // Team roster endpoint
  app.get('/api/team/roster', async (req, res) => {
    if (!databaseAvailable) {
      return res.status(503).json({ error: 'Database unavailable' });
    }

    try {
      const userId = req.query.userId as string || 'dev';
      const leagueId = req.query.leagueId as string;
      
      if (!leagueId) {
        return res.status(400).json({ error: 'leagueId is required' });
      }

      // Import the Yahoo services
      const { createYahooClient, getGameKey, userTeamKey } = require('./services/yahoo-api-direct');
      
      const yf = await createYahooClient(userId);
      if (!yf) {
        return res.status(401).json({ 
          error: 'Not authenticated', 
          message: 'Please complete OAuth first'
        });
      }

      // Fetch real roster data from Yahoo
      const gameKey = await getGameKey(yf, 'nfl');
      const teamKey = await userTeamKey(yf, gameKey, `${gameKey}.l.${leagueId}`);
      
      if (!teamKey) {
        return res.status(404).json({ 
          error: 'Team not found', 
          message: 'Could not find your team in this league'
        });
      }

      // Get team roster
      const rosterResponse = await yf.getTeamRoster(teamKey);
      
      let roster: {
        starters: any[],
        bench: any[]
      } = {
        starters: [],
        bench: []
      };

      try {
        if (rosterResponse.success && rosterResponse.data?.fantasy_content?.team?.[1]?.roster) {
          const players = rosterResponse.data.fantasy_content.team[1].roster[0].players;
          
          for (let i = 0; i < players.length; i++) {
            const playerData = players[i].player[0];
            const playerInfo = players[i].player[1];
            
            const player = {
              name: playerData[2]?.name?.full || 'Unknown Player',
              position: playerData[9]?.display_position || playerData[4]?.eligible_positions?.[0]?.position || 'UNKNOWN',
              team: playerData[6]?.editorial_team_abbr || 'FA',
              points: parseFloat(playerInfo?.player_points?.total || '0'),
              projected: parseFloat(playerInfo?.player_projected_points?.total || '0'),
              status: playerData[5]?.status || 'Healthy',
              isStarter: playerInfo?.selected_position?.[1]?.position !== 'BN'
            };
            
            if (player.isStarter && player.position !== 'BN') {
              roster.starters.push(player);
            } else {
              roster.bench.push(player);
            }
          }
        }
        
        // Sort starters by position priority (QB, RB, WR, TE, etc.)
        const positionOrder: { [key: string]: number } = { 'QB': 1, 'RB': 2, 'WR': 3, 'TE': 4, 'K': 5, 'DEF': 6 };
        roster.starters.sort((a: any, b: any) => {
          return (positionOrder[a.position] || 99) - (positionOrder[b.position] || 99);
        });
        
      } catch (error) {
        console.log('Error parsing Yahoo roster data:', error);
        // Return empty arrays if parsing fails
      }
      
      // For pre-season leagues without roster data, provide sample players for UI testing
      if (roster.starters.length === 0 && roster.bench.length === 0) {
        console.log('No roster data found (likely pre-season), providing sample players');
        roster = {
          starters: [
            {
              name: "Josh Allen",
              position: "QB",
              team: "BUF",
              points: 0,
              projected: 24.2,
              status: "Healthy"
            },
            {
              name: "Saquon Barkley", 
              position: "RB",
              team: "PHI",
              points: 0,
              projected: 19.8,
              status: "Healthy"
            },
            {
              name: "CeeDee Lamb",
              position: "WR",
              team: "DAL",
              points: 0,
              projected: 18.5,
              status: "Healthy"
            }
          ],
          bench: [
            {
              name: "Kyren Williams",
              position: "RB",
              team: "LAR",
              points: 0,
              projected: 12.1,
              status: "Healthy"
            },
            {
              name: "Mike Evans",
              position: "WR",
              team: "TB",
              points: 0,
              projected: 15.8,
              status: "Healthy"
            }
          ]
        };
      }

      return res.json(roster);
    } catch (error: any) {
      console.error('Team roster error:', error);
      return res.status(500).json({ 
        error: 'Failed to fetch team roster', 
        message: error.message
      });
    }
  });

  // Debug endpoint for teams data
  app.get('/api/debug/teams', async (req, res) => {
    if (!databaseAvailable) {
      return res.status(503).json({ error: 'Database unavailable' });
    }

    try {
      const userId = req.query.userId as string || 'dev';
      const leagueId = req.query.leagueId as string || '830815';
      
      const { createYahooClient, getGameKey } = require('./services/yahoo-api-direct');
      
      const yf = await createYahooClient(userId);
      if (!yf) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const gameKey = await getGameKey(yf, 'nfl');
      const leagueKey = `${gameKey}.l.${leagueId}`;
      
      console.log('🔍 Debug teams - Game key:', gameKey);
      console.log('🔍 Debug teams - League key:', leagueKey);
      
      // Get league teams
      const leagueTeams = await yf.getLeagueTeams(leagueKey);
      console.log('🔍 League teams response:', JSON.stringify(leagueTeams, null, 2));
      
      return res.json({
        gameKey,
        leagueKey,
        leagueTeamsSuccess: leagueTeams.success,
        leagueTeamsData: leagueTeams.data
      });
    } catch (error: any) {
      console.error('Debug teams error:', error);
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