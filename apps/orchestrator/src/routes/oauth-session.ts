import { Request, Response } from 'express';
import { z } from 'zod';

import { env } from '../config/env';
import { stateStore } from '../services/stateStore';
import { randomId, signJWT } from '../utils/jwt';

export async function createOAuthSession(req: Request, res: Response): Promise<void> {
  const Body = z.object({ discordId: z.string().min(5) });
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
    return;
  }

  const { discordId } = parsed.data;
  const secret =
    process.env.OAUTH_STATE_JWT_SECRET || env.OAUTH_STATE_JWT_SECRET || 'dev-oauth-secret';
  const kid = process.env.JWT_KID || env.JWT_KID || undefined;

  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 3 * 60; // 3 minutes - reduced from 5 to minimize auth code expiration
  const jti = randomId();

  const token = signJWT({ sub: discordId, purpose: 'yahoo_oauth', iat, exp, jti }, secret, kid);

  // Record state in store for consume-once semantics
  await stateStore.set(jti, { discordId }, (exp - iat) * 1000);

  // Build orchestrator start URL (let the server handle redirect to Yahoo)
  const host = req.get('host');
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
  const base = `${proto}://${host}`;
  const authorize_url = `${base}/api/oauth/start?state=${encodeURIComponent(token)}`;

  console.log('[oauth-session] created', {
    jti,
    sub: discordId,
    exp,
    expiresInMinutes: (exp - iat) / 60,
    timestamp: new Date().toISOString(),
  });
  res.json({ authorize_url });
}
