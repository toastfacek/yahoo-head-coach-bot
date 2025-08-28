import { Request, Response } from 'express';
import { env } from '../config/env';

export async function healthCheck(req: Request, res: Response) {
  // Simple health check that always returns 200 - no database dependency
  const healthStatus = {
    status: 'ok',
    service: 'orchestrator',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: env.NODE_ENV || 'development',
    model: env.AI_MODEL,
    version: process.env.npm_package_version || '1.0.0'
  };

  res.status(200).json(healthStatus);
}
