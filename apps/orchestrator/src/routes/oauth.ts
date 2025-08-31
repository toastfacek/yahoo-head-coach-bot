import axios from 'axios';
import { Request, Response } from 'express';
import { z } from 'zod';

import { prisma } from '../db';
import { env } from '../config/env';
import { verifyJWT } from '../utils/jwt';
import { stateStore } from '../services/stateStore';

// Use shared Prisma client

/**
 * Start OAuth flow - redirect user to Yahoo authorization server
 */
export async function oauthStart(req: Request, res: Response): Promise<void> {
  try {
    const Query = z.object({ state: z.string() });
    const parsed = Query.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid query', details: parsed.error.flatten() });
      return;
    }
    const { state } = parsed.data as any;

    // Validate signed state if provided; otherwise allow legacy userId in dev only
    let ensuredUserId: string | null = null;
    try {
      const secret = env.OAUTH_STATE_JWT_SECRET || 'dev-oauth-secret';
      const payload = verifyJWT<any>(String(state), secret);
      if (payload.purpose !== 'yahoo_oauth') throw new Error('Invalid state purpose');
      if (!payload.jti) throw new Error('Missing jti');
      const rec = await stateStore.consume(payload.jti);
      if (!rec) throw new Error('Invalid or consumed state');
      ensuredUserId = String(rec.discordId || payload.sub || 'dev');
    } catch (e) {
      res.status(400).send('<h2>❌ Invalid Authorization Request</h2><p>Invalid or expired state parameter</p>');
      return;
    }

    const authUrl = new URL('https://api.login.yahoo.com/oauth2/request_auth');
    authUrl.searchParams.append('client_id', process.env.YAHOO_CLIENT_ID!);
    authUrl.searchParams.append('redirect_uri', process.env.YAHOO_REDIRECT_URI!);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('scope', 'fspt-w');
    // Pass through the signed state as received
    authUrl.searchParams.append('state', String(state));

    console.log('Redirecting to Yahoo OAuth:', authUrl.toString());
    res.redirect(authUrl.toString());
  } catch (error) {
    console.error('OAuth start error:', error);
    res.status(500).json({ error: 'OAuth initialization failed', message: error instanceof Error ? error.message : 'Unknown error' });
  }
}

/**
 * Handle OAuth callback - exchange authorization code for tokens
 */
export async function oauthCallback(req: Request, res: Response): Promise<void> {
  try {
    const Query = z.object({
      code: z.string().optional(),
      state: z.string().optional(),
      error: z.string().optional(),
    });
    const parsed = Query.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid query', details: parsed.error.flatten() });
      return;
    }
    const { code, state, error: oauthError } = parsed.data as any;

    // Handle OAuth denial or error
    if (oauthError) {
      console.error('OAuth error from Yahoo:', oauthError);
      res.status(400).send(`
        <h2>❌ Yahoo Authorization Failed</h2>
        <p>Error: ${oauthError}</p>
        <p>Please try authenticating again.</p>
      `);
      return;
    }

    // Validate required parameters
    if (!code || !state) {
      res.status(400).send(`
        <h2>❌ Missing OAuth Parameters</h2>
        <p>Authorization code and state are required</p>
        <p>Please try authenticating again.</p>
      `);
      return;
    }

    // Validate state parameter (CSRF protection)
    let ensuredUserId: string | null = null;
    try {
      const secret = env.OAUTH_STATE_JWT_SECRET || 'dev-oauth-secret';
      const payload = verifyJWT<any>(String(state), secret);
      if (payload.purpose !== 'yahoo_oauth') throw new Error('Invalid state purpose');
      if (!payload.jti) throw new Error('Missing jti');
      const rec = await stateStore.consume(payload.jti);
      if (!rec) throw new Error('Invalid or consumed state');
      ensuredUserId = String(rec.discordId || payload.sub || 'dev');
    } catch (e) {
      res.status(400).send(`
        <h2>❌ Invalid Authorization Request</h2>
        <p>Invalid or expired state parameter</p>
        <p>Please try authenticating again.</p>
      `);
      return;
    }

    // Exchange authorization code for access token
    const tokenResponse = await exchangeCodeForTokens(code as string);

    // Create or find user
    const userId = ensuredUserId || 'dev';
    let user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          id: userId,
          email: `${userId}@example.com`, // Placeholder email
        },
      });
    }

    // Calculate token expiration
    const expiresAt = new Date(Date.now() + tokenResponse.expires_in * 1000);

    // Store or update tokens in database
    await prisma.yahooToken.upsert({
      where: { userId: user.id },
      update: {
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
        expiresAt,
        tokenType: tokenResponse.token_type || 'bearer',
        scope: tokenResponse.scope || 'fspt-w',
      },
      create: {
        userId: user.id,
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
        expiresAt,
        tokenType: tokenResponse.token_type || 'bearer',
        scope: tokenResponse.scope || 'fspt-w',
      },
    });

    // Link Discord user mapping and set as authenticated if present/needed
    try {
      // Upsert DiscordUser by discordId=userId
      const discordId = userId;
      const existing = await prisma.discordUser.findUnique({ where: { discordId } });
      if (existing) {
        await prisma.discordUser.update({
          where: { discordId },
          data: { userId: user.id, isAuthenticated: true },
        });
      } else {
        await prisma.discordUser.create({
          data: {
            discordId,
            discordUsername: discordId,
            userId: user.id,
            isAuthenticated: true,
          },
        });
      }
    } catch (linkErr) {
      console.warn('Failed to link Discord user during OAuth callback:', linkErr);
    }

    console.log(`OAuth tokens stored and user linked successfully for user: ${userId}`);

    // Success response - HTML format to match working simple-server implementation
    res.send(`
      <h2>✅ Yahoo Authentication Complete!</h2>
      <p>Tokens successfully stored for user: <strong>${userId}</strong></p>
      <p>You can now return to your Streamlit app and refresh the page.</p>
      <script>
        setTimeout(() => {
          window.close();
        }, 3000);
      </script>
    `);
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).send(`
      <h2>❌ OAuth Processing Failed</h2>
      <p>Error: ${error instanceof Error ? error.message : 'Unknown error'}</p>
      <p>Please try authenticating again.</p>
    `);
  }
}

/**
 * Simple token status for a user
 */
export async function tokenStatus(req: Request, res: Response): Promise<void> {
  try {
    const Query = z.object({ userId: z.string().optional() });
    const parsed = Query.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid query', details: parsed.error.flatten() });
      return;
    }
    const userId = String(parsed.data.userId || 'dev');
    const tok = await prisma.yahooToken.findUnique({ where: { userId } });
    if (!tok) {
      res.json({ authenticated: false, userId });
      return;
    }
    const msLeft = tok.expiresAt.getTime() - Date.now();
    res.json({
      authenticated: true,
      userInfo: {
        id: userId,
        scope: tok.scope,
        tokenType: tok.tokenType,
        expiresAt: tok.expiresAt.toISOString(),
        expiresInSeconds: Math.max(Math.floor(msLeft / 1000), 0),
      },
    });
  } catch (error) {
    console.error('tokenStatus error:', error);
    res.status(500).json({ error: 'Failed to fetch token status' });
  }
}

/**
 * Trigger a token refresh for a user
 */
export async function refreshNow(req: Request, res: Response): Promise<void> {
  try {
    const Query = z.object({ userId: z.string().optional() });
    const parsed = Query.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid query', details: parsed.error.flatten() });
      return;
    }
    const userId = String(parsed.data.userId || 'dev');
    await refreshToken(userId);
    const tok = await prisma.yahooToken.findUnique({ where: { userId } });
    res.json({ ok: true, userId, expiresAt: tok?.expiresAt?.toISOString() });
  } catch (error: any) {
    console.error('refreshNow error:', error);
    res.status(500).json({ error: 'Refresh failed', message: error?.message || 'Unknown error' });
  }
}

/**
 * Exchange authorization code for access and refresh tokens
 */
async function exchangeCodeForTokens(code: string) {
  const tokenUrl = 'https://api.login.yahoo.com/oauth2/get_token';

  // Prepare form data for token exchange
  const formData = new URLSearchParams({
    client_id: process.env.YAHOO_CLIENT_ID!,
    client_secret: process.env.YAHOO_CLIENT_SECRET!,
    redirect_uri: process.env.YAHOO_REDIRECT_URI!,
    code: code,
    grant_type: 'authorization_code',
  });

  // Create Basic Auth header (alternative to form data approach)
  const credentials = Buffer.from(
    `${process.env.YAHOO_CLIENT_ID}:${process.env.YAHOO_CLIENT_SECRET}`
  ).toString('base64');

  try {
    console.log('🔍 Token exchange debug:');
    console.log('Redirect URI being sent:', process.env.YAHOO_REDIRECT_URI);
    console.log('Form data:', formData.toString());

    const response = await axios.post(tokenUrl, formData.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${credentials}`,
        'User-Agent': 'Yahoo Fantasy HeadCoach Bot/1.0',
      },
    });

    if (!response.data.access_token) {
      throw new Error('No access token received from Yahoo');
    }

    return {
      access_token: response.data.access_token,
      refresh_token: response.data.refresh_token,
      expires_in: response.data.expires_in || 3600, // Default 1 hour
      token_type: response.data.token_type || 'bearer',
      scope: response.data.scope,
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('Yahoo token exchange error:', error.response?.data);
      throw new Error(
        `Token exchange failed: ${error.response?.data?.error_description || error.message}`
      );
    }
    throw error;
  }
}

/**
 * Refresh expired access token using refresh token
 */
export async function refreshToken(userId: string): Promise<void> {
  try {
    const tokenRecord = await prisma.yahooToken.findUnique({
      where: { userId },
    });

    if (!tokenRecord || !tokenRecord.refreshToken) {
      throw new Error('No refresh token found for user');
    }

    const tokenUrl = 'https://api.login.yahoo.com/oauth2/get_token';

    const formData = new URLSearchParams({
      client_id: process.env.YAHOO_CLIENT_ID!,
      client_secret: process.env.YAHOO_CLIENT_SECRET!,
      refresh_token: tokenRecord.refreshToken,
      grant_type: 'refresh_token',
    });

    const credentials = Buffer.from(
      `${process.env.YAHOO_CLIENT_ID}:${process.env.YAHOO_CLIENT_SECRET}`
    ).toString('base64');

    const response = await axios.post(tokenUrl, formData.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${credentials}`,
        'User-Agent': 'Yahoo Fantasy HeadCoach Bot/1.0',
      },
    });

    const expiresAt = new Date(Date.now() + response.data.expires_in * 1000);

    // Update tokens in database
    await prisma.yahooToken.update({
      where: { userId },
      data: {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token || tokenRecord.refreshToken, // Keep old refresh token if new one not provided
        expiresAt,
        tokenType: response.data.token_type || 'bearer',
        scope: response.data.scope || tokenRecord.scope,
      },
    });

    console.log(`Tokens refreshed successfully for user: ${userId}`);
  } catch (error) {
    console.error('Token refresh error:', error);
    throw error;
  }
}
