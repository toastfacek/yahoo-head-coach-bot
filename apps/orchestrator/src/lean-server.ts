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
    oauthLoaded,
    endpoints: {
      health: '/api/health',
      oauth: {
        start: '/api/oauth/start',
        callback: '/api/oauth/callback', 
        status: '/api/oauth/status'
      },
      debug: '/api/debug/routes'
    },
  });
});

// Debug endpoint to list registered routes
app.get('/api/debug/routes', (req, res) => {
  const routes: any[] = [];
  
  app._router?.stack?.forEach((middleware: any) => {
    if (middleware.route) {
      // Direct routes
      const path = middleware.route.path;
      const methods = Object.keys(middleware.route.methods);
      routes.push({ path, methods });
    } else if (middleware.name === 'router') {
      // Router middleware
      middleware.handle?.stack?.forEach((handler: any) => {
        if (handler.route) {
          const path = handler.route.path;
          const methods = Object.keys(handler.route.methods);
          routes.push({ path, methods });
        }
      });
    }
  });

  res.json({
    oauthLoaded,
    routeCount: routes.length,
    routes: routes.sort((a, b) => a.path.localeCompare(b.path)),
    timestamp: new Date().toISOString()
  });
});

// Load OAuth routes only (most critical for user experience)
let oauthLoaded = false;
async function loadOAuthRoutes() {
  try {
    console.log('🔄 Loading OAuth routes...');
    
    // Import OAuth functions directly to avoid loading all routes
    const oauth = await import('./routes/oauth');
    console.log('🔄 OAuth module imported, registering routes...');
    
    // Verify functions exist before registering
    if (!oauth.oauthStart || !oauth.oauthCallback || !oauth.tokenStatus || !oauth.refreshNow) {
      throw new Error('Missing OAuth functions in import');
    }
    
    // OAuth endpoints - critical for Discord login
    app.get('/api/oauth/start', oauth.oauthStart);
    console.log('✅ Registered: GET /api/oauth/start');
    
    app.get('/api/oauth/callback', oauth.oauthCallback);
    console.log('✅ Registered: GET /api/oauth/callback');
    
    app.get('/api/oauth/status', oauth.tokenStatus);
    console.log('✅ Registered: GET /api/oauth/status');
    
    app.get('/api/oauth/refresh', oauth.refreshNow);
    console.log('✅ Registered: GET /api/oauth/refresh');
    
    oauthLoaded = true;
    console.log('✅ All OAuth routes loaded successfully');
    
    // Register 404 handler AFTER OAuth routes are loaded
    app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.originalUrl} not found`,
        availableEndpoints: {
          health: '/api/health',
          oauth: {
            start: '/api/oauth/start?state=JWT_TOKEN',
            callback: '/api/oauth/callback',
            status: '/api/oauth/status'
          },
          debug: '/api/debug/routes'
        },
      });
    });
    console.log('✅ 404 handler registered after OAuth routes');
    
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

// Temporary 404 handler for pre-OAuth loading period
app.use('*', (req, res, next) => {
  if (!oauthLoaded && req.path.includes('/oauth/')) {
    res.status(503).json({
      error: 'Service Loading',
      message: 'OAuth routes are still loading. Please try again in a few seconds.',
    });
  } else if (!oauthLoaded && !req.path.match(/^\/(api\/health|api\/debug\/routes|api)$/)) {
    res.status(503).json({
      error: 'Service Loading',
      message: 'Server is still initializing. Limited endpoints available.',
      availableEndpoints: { 
        health: '/api/health',
        debug: '/api/debug/routes'
      },
    });
  } else {
    // Let the request continue to other routes
    next();
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