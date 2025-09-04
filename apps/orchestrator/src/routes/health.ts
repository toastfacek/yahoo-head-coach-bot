import { Request, Response } from 'express';

import { env } from '../config/env';
import { getDatabaseHealth } from '../db';

export async function healthCheck(req: Request, res: Response) {
  try {
    // Check database connectivity
    const dbHealth = await getDatabaseHealth();

    const healthStatus = {
      status: dbHealth.healthy ? 'ok' : 'degraded',
      service: 'orchestrator',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: env.NODE_ENV || 'development',
      model: env.AI_MODEL,
      version: process.env.npm_package_version || '1.0.0',
      database: {
        connected: dbHealth.healthy,
        latency: dbHealth.latency,
        error: dbHealth.error,
      },
    };

    // Return 200 if service is operational (even if database is degraded)
    // Return 503 only if critical services are down
    const statusCode = 200;

    res.status(statusCode).json(healthStatus);
  } catch (error) {
    // If health check itself fails, return minimal response
    const errorStatus = {
      status: 'error',
      service: 'orchestrator',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    };

    res.status(500).json(errorStatus);
  }
}
