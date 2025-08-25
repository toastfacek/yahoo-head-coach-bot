import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import router from './routes';
import { env, allowedOrigins } from './config/env';

// Load environment variables
dotenv.config();

const app = express();
const PORT = Number(env.PORT || 3000);

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
app.use('/api', router);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.originalUrl} not found`,
    availableEndpoints: {
      health: '/api/health',
      reports: '/api/reports/daily'
    }
  });
});

// Error handling middleware
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', error);
  
  res.status(error.status || 500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// Graceful shutdown handling
const server = app.listen(PORT, () => {
  console.log(`🚀 HeadCoach Orchestrator server running on port ${PORT}`);
  console.log(`📊 Health check available at: http://localhost:${PORT}/api/health`);
  console.log(`📈 Environment: ${env.NODE_ENV} | Model: ${env.AI_MODEL} | Mode: ${env.EXECUTION_MODE}`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('Process terminated');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  server.close(() => {
    console.log('Process terminated');
    process.exit(0);
  });
});

export default app;
