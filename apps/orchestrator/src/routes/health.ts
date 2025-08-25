import { Request, Response } from 'express';
import { prisma } from '../db';
import { env } from '../config/env';

export async function healthCheck(req: Request, res: Response) {
  try {
    let dbStatus: 'ok' | 'error' = 'ok';
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbStatus = 'ok';
    } catch (e) {
      dbStatus = 'error';
    }
    const healthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: env.NODE_ENV || 'development',
      database: dbStatus,
      model: env.AI_MODEL,
      mode: env.EXECUTION_MODE,
      version: process.env.npm_package_version || '1.0.0'
    };

    res.status(200).json(healthStatus);
  } catch (error) {
    console.error('Health check failed:', error);
    
    const healthStatus = {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: env.NODE_ENV || 'development',
      database: 'error',
      version: process.env.npm_package_version || '1.0.0',
      error: error instanceof Error ? error.message : 'Unknown error'
    };

    res.status(503).json(healthStatus);
  }
}
