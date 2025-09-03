// Ultra-lean server focused on OAuth and health endpoints to prevent Railway memory crashes
console.log('🔄 Starting lean orchestrator server...');

// Minimal imports - avoid heavy dependencies during startup
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

const app = express();
const PORT = Number(process.env.PORT || 3000);

console.log('🔧 Memory-efficient server configuration');
console.log(`🔧 Memory usage: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);
console.log(`🔧 Starting on port: ${PORT}`);

// Minimal middleware
app.use(helmet({ crossOriginEmbedderPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '1mb' })); // Reduced from 10mb
app.use(express.urlencoded({ extended: true }));

// Immediate health endpoint - no dependencies
app.get('/api/health', (req, res) => {
  const memUsage = process.memoryUsage();
  res.status(200).json({
    status: 'ok',
    service: 'orchestrator-lean',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'production',
    version: '1.0.0-lean',
    memory: {
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + 'MB',
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + 'MB',
      rss: Math.round(memUsage.rss / 1024 / 1024) + 'MB',
    }
  });
});

// Root endpoint
app.get('/api', (req, res) => {
  res.status(200).json({
    message: 'Yahoo Fantasy Football HeadCoach API - Lean Version',
    version: '1.0.0-lean',
    endpoints: {
      health: '/api/health',
      oauth: {
        start: '/api/oauth/start',
        callback: '/api/oauth/callback',
        status: '/api/oauth/status'
      }
    },
  });
});

// Load OAuth routes only (most critical for user experience)
let oauthLoaded = false;
async function loadOAuthRoutes() {
  try {
    console.log('🔄 Loading OAuth routes...');
    
    // Import OAuth functions directly to avoid loading all routes
    const oauth = await import('./routes/oauth');
    
    // OAuth endpoints - critical for Discord login
    app.get('/api/oauth/start', oauth.oauthStart);
    app.get('/api/oauth/callback', oauth.oauthCallback);
    app.get('/api/oauth/status', oauth.tokenStatus);
    app.get('/api/oauth/refresh', oauth.refreshNow);
    
    oauthLoaded = true;
    console.log('✅ OAuth routes loaded successfully');
    
    // Connect to database after OAuth routes are ready
    setTimeout(async () => {
      try {
        console.log('🔄 Connecting to database...');
        const { connectDatabase, getDatabaseHealth } = await import('./db');
        await connectDatabase();
        
        const health = await getDatabaseHealth();
        if (health.healthy) {
          console.log(`✅ Database ready (${health.latency}ms latency)`);
        } else {
          console.warn(`⚠️  Database issue: ${health.error}`);
        }
      } catch (dbError) {
        console.error('❌ Database connection failed:', dbError);
        console.log('📝 OAuth will fail until database is available');
      }
    }, 500);
    
  } catch (error) {
    console.error('❌ Failed to load OAuth routes:', error);
  }
}

// Basic 404 handler
app.use('*', (req, res) => {
  if (!oauthLoaded && req.path.includes('/oauth/')) {
    res.status(503).json({
      error: 'Service Loading',
      message: 'OAuth routes are still loading. Please try again in a few seconds.',
    });
  } else if (!oauthLoaded) {
    res.status(503).json({
      error: 'Service Loading', 
      message: 'Server is still initializing. Only health endpoint available.',
      availableEndpoints: { health: '/api/health' },
    });
  } else {
    res.status(404).json({
      error: 'Not Found',
      message: `Route ${req.originalUrl} not found`,
      availableEndpoints: {
        health: '/api/health',
        oauth: '/api/oauth/start?state=JWT_TOKEN',
      },
    });
  }
});

// Minimal error handler
app.use((error: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Request error:', error.message);
  res.status(error.status || 500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
  });
});

async function startServer() {
  console.log('🚀 Starting lean HTTP server...');
  
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`📊 Health: http://0.0.0.0:${PORT}/api/health`);
    console.log(`🔐 OAuth: http://0.0.0.0:${PORT}/api/oauth/start`);
    
    const memUsage = process.memoryUsage();
    console.log(`💾 Memory: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB used of ${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`);
  });

  // Load OAuth routes after server is running
  setTimeout(loadOAuthRoutes, 100);

  // Handle graceful shutdown
  const gracefulShutdown = async (signal: string) => {
    console.log(`${signal} received, shutting down gracefully...`);
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  return server;
}

startServer().catch((error) => {
  console.error('❌ CRITICAL: Server failed to start:', error);
  process.exit(1);
});

export default app;