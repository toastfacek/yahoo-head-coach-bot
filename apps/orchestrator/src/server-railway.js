// Railway-optimized server with OAuth support
// Uses CommonJS to avoid TypeScript compilation issues

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { PrismaClient } = require('@prisma/client');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Prisma client
const prisma = new PrismaClient();

console.log('🚀 Starting Railway server with OAuth support...');

// Basic middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'orchestrator',
    message: 'Yahoo Fantasy HeadCoach API is running',
    timestamp: new Date().toISOString(),
  });
});

// Health check endpoint (no database dependency)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'orchestrator',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'production',
  });
});

// OAuth start endpoint - redirect to Yahoo authorization
app.get('/api/oauth/start', (req, res) => {
  try {
    const { state } = req.query;
    
    if (!state) {
      return res.status(400).json({ error: 'Missing required state parameter' });
    }

    const authUrl = new URL('https://api.login.yahoo.com/oauth2/request_auth');
    authUrl.searchParams.append('client_id', process.env.YAHOO_CLIENT_ID);
    authUrl.searchParams.append('redirect_uri', process.env.YAHOO_REDIRECT_URI);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('scope', 'fspt-w');
    authUrl.searchParams.append('state', state);

    console.log('Redirecting to Yahoo OAuth:', authUrl.toString());
    res.redirect(authUrl.toString());
  } catch (error) {
    console.error('OAuth start error:', error);
    res.status(500).json({ error: 'OAuth initialization failed' });
  }
});

// OAuth callback endpoint - handle Yahoo callback and exchange for tokens
app.get('/api/oauth/callback', async (req, res) => {
  try {
    const { code, state, error: oauthError } = req.query;

    if (oauthError) {
      console.error('OAuth error from Yahoo:', oauthError);
      return res.status(400).send(`
        <h2>❌ Yahoo Authorization Failed</h2>
        <p>Error: ${oauthError}</p>
        <p>Please try authenticating again.</p>
      `);
    }

    if (!code || !state) {
      return res.status(400).send(`
        <h2>❌ Missing OAuth Parameters</h2>
        <p>Authorization code and state are required</p>
        <p>Please try authenticating again.</p>
      `);
    }

    // Exchange code for tokens
    const tokenResponse = await exchangeCodeForTokens(code);
    
    // For now, use simplified user creation (dev user)
    const userId = 'dev'; // In production, this would be extracted from state
    
    let user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          id: userId,
          email: `${userId}@example.com`,
        },
      });
    }

    // Calculate token expiration
    const expiresAt = new Date(Date.now() + tokenResponse.expires_in * 1000);

    // Store tokens
    await prisma.yahooToken.upsert({
      where: { userId: user.id },
      update: {
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
        expiresAt,
        tokenType: tokenResponse.token_type || 'bearer',
        scope: tokenResponse.scope || 'fspt-w',
      },
      create: {
        userId: user.id,
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
        expiresAt,
        tokenType: tokenResponse.token_type || 'bearer',
        scope: tokenResponse.scope || 'fspt-w',
      },
    });

    console.log(`OAuth tokens stored successfully for user: ${userId}`);

    res.send(`
      <h2>✅ Yahoo Authentication Complete!</h2>
      <p>Tokens successfully stored for user: <strong>${userId}</strong></p>
      <p>You can now return to your application.</p>
      <script>
        setTimeout(() => {
          window.close();
        }, 3000);
      </script>
    `);
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).send(`
      <h2>❌ OAuth Processing Failed</h2>
      <p>Error: ${error.message}</p>
      <p>Please try authenticating again.</p>
    `);
  }
});

// Token exchange helper
async function exchangeCodeForTokens(code) {
  const tokenUrl = 'https://api.login.yahoo.com/oauth2/get_token';

  const formData = new URLSearchParams({
    client_id: process.env.YAHOO_CLIENT_ID,
    client_secret: process.env.YAHOO_CLIENT_SECRET,
    redirect_uri: process.env.YAHOO_REDIRECT_URI,
    code: code,
    grant_type: 'authorization_code',
  });

  const credentials = Buffer.from(
    `${process.env.YAHOO_CLIENT_ID}:${process.env.YAHOO_CLIENT_SECRET}`
  ).toString('base64');

  try {
    const response = await axios.post(tokenUrl, formData.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${credentials}`,
        'User-Agent': 'Yahoo Fantasy HeadCoach Bot/1.0',
      },
    });

    if (!response.data.access_token) {
      throw new Error('No access token received from Yahoo');
    }

    return {
      access_token: response.data.access_token,
      refresh_token: response.data.refresh_token,
      expires_in: response.data.expires_in || 3600,
      token_type: response.data.token_type || 'bearer',
      scope: response.data.scope,
    };
  } catch (error) {
    if (error.response) {
      console.error('Yahoo token exchange error:', error.response.data);
      throw new Error(`Token exchange failed: ${error.response.data.error_description || error.message}`);
    }
    throw error;
  }
}

// Fallback for all other routes
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.originalUrl} not found`,
    service: 'orchestrator',
    availableEndpoints: {
      health: '/api/health',
      oauth: {
        start: '/api/oauth/start',
        callback: '/api/oauth/callback',
      },
    },
  });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`✅ Railway server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🏠 Root: http://localhost:${PORT}/`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('✅ Process terminated');
    process.exit(0);
  });
});

module.exports = { app, server };
