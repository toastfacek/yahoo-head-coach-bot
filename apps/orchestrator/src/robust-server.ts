// Robust server that starts health endpoint first, loads routes async
console.log('🔄 Loading environment configuration...');
import 'dotenv/config';

console.log('🔄 Importing core dependencies...');
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';

console.log('🔄 Loading basic configuration...');
import { env } from './config/env';

const app = express();
const PORT = Number(process.env.PORT || env.PORT || 3000);

console.log('🔄 Setting up basic server...');

// Basic middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Always-available health endpoint (no dependencies)
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'orchestrator',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: env.NODE_ENV || 'development',
    model: env.AI_MODEL,
    version: process.env.npm_package_version || '1.0.0',
    routes_loaded: (app as any).routesLoaded || false,
    database_ready: (app as any).dbReady || false,
  });
});

// Root endpoint
app.get('/api', (req, res) => {
  res.status(200).json({
    message: 'Yahoo Fantasy Football HeadCoach API - Orchestrator',
    version: process.env.npm_package_version || '1.0.0',
    status: (app as any).routesLoaded ? 'fully-loaded' : 'loading',
    endpoints: {
      health: '/api/health',
    },
  });
});

// 404 handler
app.use('*', (req, res) => {
  if (!(app as any).routesLoaded) {
    res.status(503).json({
      error: 'Service Loading',
      message: 'Server is still loading routes. Please try again in a few seconds.',
      availableEndpoints: {
        health: '/api/health',
      },
    });
  } else {
    res.status(404).json({
      error: 'Not Found',
      message: `Route ${req.originalUrl} not found`,
      availableEndpoints: {
        health: '/api/health',
        reports: '/api/reports/daily',
      },
    });
  }
});

// Error handling middleware
app.use((error: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', error);
  res.status(error.status || 500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
  });
});

async function startServer() {
  console.log('🔄 Starting server initialization...');
  console.log(`🔧 NODE_OPTIONS: ${process.env.NODE_OPTIONS}`);
  console.log(`🔧 Memory limit: ${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB`);
  console.log(`🔧 Port configuration: ${PORT} (from ${process.env.PORT ? 'env.PORT' : 'default'})`);

  // Start HTTP server first (non-blocking)
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 HeadCoach Orchestrator server running on port ${PORT}`);
    console.log(`📊 Health check available at: http://0.0.0.0:${PORT}/api/health`);
    console.log(
      `📈 Environment: ${env.NODE_ENV} | Model: ${env.AI_MODEL} | Mode: ${env.EXECUTION_MODE}`
    );
    console.log('✅ HTTP server is ready to accept connections');
  });

  // Load routes and database concurrently after server starts
  setTimeout(async () => {
    // Start both route loading and database connection concurrently
    const routesPromise = loadRoutes();
    const dbPromise = connectToDatabase();

    // Wait for both to complete
    await Promise.allSettled([routesPromise, dbPromise]);
  }, 1000);

  // Function to load routes
  async function loadRoutes() {
    try {
      console.log('🔄 Loading routes asynchronously...');

      // Import additional middleware
      const rateLimit = (await import('express-rate-limit')).default;
      const pinoHttp = (await import('pino-http')).default;

      // Add additional middleware
      app.use(
        pinoHttp({
          autoLogging: true,
          serializers: {
            req(req) {
              return { id: (req as any).id, method: req.method, url: req.url };
            },
            res(res) {
              return { statusCode: res.statusCode };
            },
          },
        })
      );

      // Basic rate limiting
      const limiter = rateLimit({ windowMs: 60_000, max: 30 });
      app.use('/api/scheduler', limiter);
      app.use('/api/approvals', limiter);

      // Load full routes
      console.log('🔄 Importing full route configuration...');
      const { default: router } = await import('./routes');
      app.use('/api', router);

      (app as any).routesLoaded = true;
      console.log('✅ All routes loaded successfully');
    } catch (error) {
      console.error('❌ Failed to load routes:', error);
      console.log('📝 Server continues with basic health endpoint only');
    }
  }

  // Function to connect to database
  async function connectToDatabase() {
    try {
      console.log('🔄 Connecting to database concurrently...');
      const { connectDatabase, getDatabaseHealth } = await import('./db');
      await connectDatabase();

      const health = await getDatabaseHealth();
      if (health.healthy) {
        console.log(`✅ Database connection healthy (${health.latency}ms latency)`);
        (app as any).dbReady = true;
      } else {
        console.warn(`⚠️  Database connection unhealthy: ${health.error}`);
      }
    } catch (error) {
      console.error('❌ Database connection failed:', error);
      console.log('📝 Server continues with limited functionality (OAuth will fail)');
    }
  }

  return server;
}

console.log('🚀 Initiating server startup...');

startServer()
  .then((server) => {
    console.log('✅ Server startup completed successfully');

    // Handle graceful shutdown
    process.on('SIGTERM', async () => {
      console.log('SIGTERM received, shutting down gracefully...');
      try {
        const { disconnectDatabase } = await import('./db');
        await disconnectDatabase();
      } catch (error) {
        console.warn('Error disconnecting database:', error);
      }
      server.close(() => {
        console.log('Process terminated');
        process.exit(0);
      });
    });

    process.on('SIGINT', async () => {
      console.log('SIGINT received, shutting down gracefully...');
      try {
        const { disconnectDatabase } = await import('./db');
        await disconnectDatabase();
      } catch (error) {
        console.warn('Error disconnecting database:', error);
      }
      server.close(() => {
        console.log('Process terminated');
        process.exit(0);
      });
    });
  })
  .catch((error) => {
    console.error('❌ CRITICAL: Failed to start server:', error);
    console.error('Stack trace:', error.stack);
    console.error('Environment debug:', {
      NODE_ENV: process.env.NODE_ENV,
      PORT: process.env.PORT,
      NODE_OPTIONS: process.env.NODE_OPTIONS,
    });
    process.exit(1);
  });

export default app;
