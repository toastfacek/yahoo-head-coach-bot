import { Request, Response } from 'express';
import { z } from 'zod';

/**
 * Fallback OAuth routes for when database is unavailable
 * These simulate the OAuth flow for testing purposes
 */

export async function oauthStartFallback(req: Request, res: Response): Promise<void> {
  const Query = z.object({ userId: z.string().optional() });
  const parsed = Query.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid query', details: parsed.error.flatten() });
    return;
  }
  
  res.json({
    message: 'Database unavailable - OAuth flow disabled',
    action: 'Please fix database connection and restart server',
    userId: parsed.data.userId || 'dev'
  });
}

export async function oauthCallbackFallback(req: Request, res: Response): Promise<void> {
  res.json({
    message: 'Database unavailable - OAuth callback disabled',
    action: 'Please fix database connection and restart server'
  });
}

export async function tokenStatusFallback(req: Request, res: Response): Promise<void> {
  const Query = z.object({ userId: z.string().optional() });
  const parsed = Query.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid query', details: parsed.error.flatten() });
    return;
  }
  
  res.json({
    userId: parsed.data.userId || 'dev',
    hasToken: false,
    message: 'Database unavailable - cannot check token status'
  });
}

export async function refreshNowFallback(req: Request, res: Response): Promise<void> {
  res.status(503).json({
    error: 'Database unavailable - cannot refresh tokens',
    action: 'Please fix database connection and restart server'
  });
}