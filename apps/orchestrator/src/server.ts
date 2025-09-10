// Load environment variables first
console.log('🔄 Loading environment configuration...');
import 'dotenv/config';

console.log('🔄 Importing dependencies...');
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import pinoHttp from 'pino-http';

console.log('🔄 Loading configuration...');
import { env, allowedOrigins } from './config/env';
import { connectDatabase, getDatabaseHealth, disconnectDatabase } from './db';
console.log('🔄 Importing routes...');
import router from './routes';
import { healthCheck } from './routes/health';
console.log('✅ Routes imported successfully');

const app = express();
// Prefer platform-provided PORT (e.g., Railway), then env schema, then 3000
const PORT = Number(process.env.PORT || env.PORT || 3000);

// Security middleware
app.use(helmet());

// Structured request logging
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

// CORS configuration
app.use(cors({ origin: allowedOrigins(), credentials: true }));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Basic rate limiting for scheduler and write-like endpoints
const limiter = rateLimit({ windowMs: 60_000, max: 30 });
app.use('/api/scheduler', limiter);
app.use('/api/approvals', limiter);

// API routes
console.log('🔄 Loading API routes...');
try {
  // Root-level health endpoint for platform healthchecks (e.g., Railway default /health)
  app.get('/health', healthCheck);

  app.use('/api', router);
  console.log('✅ API routes loaded successfully');
} catch (error) {
  console.error('❌ Failed to load API routes:', error);
}

// Debug routes for Railway
app.get('/debug/routes', (req, res) => {
  res.json({
    message: 'Router loaded successfully',
    availableRoutes: [
      '/api/health',
      '/api/oauth/start',
      '/api/oauth/callback',
      '/api/oauth/session',
    ],
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.originalUrl} not found`,
    availableEndpoints: {
      health: '/api/health',
      reports: '/api/reports/daily',
    },
  });
});

// Error handling middleware
app.use((error: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', error);

  res.status(error.status || 500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
  });
});

// Start server immediately, connect to database in background
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

  // Connect to database in background (non-blocking)
  setTimeout(async () => {
    try {
      console.log('🔄 Connecting to database in background...');
      await connectDatabase();

      // Test database health
      const health = await getDatabaseHealth();
      if (health.healthy) {
        console.log(`✅ Database connection healthy (${health.latency}ms latency)`);
      } else {
        console.warn(`⚠️  Database connection unhealthy: ${health.error}`);
      }
    } catch (error) {
      console.error('❌ Database connection failed:', error);
      console.log('📝 Server continues with limited functionality (database routes will fail)');
    }
  }, 1000); // Wait 1 second after server starts

  return server;
}

console.log('🚀 Initiating server startup...');

startServer()
  .then((server) => {
    console.log('✅ Server startup completed successfully');

    // Handle graceful shutdown
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
