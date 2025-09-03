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

    // Validate the signed state minimally (do not consume here)
    try {
      const secret = process.env.OAUTH_STATE_JWT_SECRET || env.OAUTH_STATE_JWT_SECRET || 'dev-oauth-secret';
      const payload = verifyJWT<any>(String(state), secret);
      if (payload.purpose !== 'yahoo_oauth') throw new Error('Invalid state purpose');
      if (!payload.jti) throw new Error('Missing jti');
      // Do not require presence in stateStore at this step to avoid cross-instance issues
      console.log('[oauth-start] validated state', { jti: payload.jti, sub: payload.sub });
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
      console.log('[oauth-callback] Starting state validation...');
      console.log('[oauth-callback] State parameter:', state?.substring(0, 50) + '...');
      
      const secret = process.env.OAUTH_STATE_JWT_SECRET || env.OAUTH_STATE_JWT_SECRET || 'dev-oauth-secret';
      console.log('[oauth-callback] Using secret:', secret === 'dev-oauth-secret' ? 'dev-default' : 'env-provided');
      
      const payload = verifyJWT<any>(String(state), secret);
      console.log('[oauth-callback] JWT payload:', { 
        purpose: payload.purpose, 
        jti: payload.jti, 
        sub: payload.sub, 
        exp: payload.exp, 
        iat: payload.iat 
      });
      
      if (payload.purpose !== 'yahoo_oauth') throw new Error('Invalid state purpose');
      if (!payload.jti) throw new Error('Missing jti');
      
      console.log('[oauth-callback] Attempting to consume state from store...');
      const rec = await stateStore.consume(payload.jti);
      console.log('[oauth-callback] State store result:', rec ? 'found' : 'not found');
      
      // If rec is missing (e.g., different instance), fall back to JWT subject
      ensuredUserId = String((rec && (rec as any).discordId) || payload.sub || '');
      console.log('[oauth-callback] Derived ensuredUserId:', ensuredUserId);
      
      if (!ensuredUserId || ensuredUserId === 'dev') throw new Error('Missing ensured user id');
      console.log('[oauth-callback] State validation successful', { jti: payload.jti, ensuredUserId, hadState: !!rec });
    } catch (e) {
      console.error('[oauth-callback] State validation failed:', e);
      console.error('[oauth-callback] Error details:', {
        message: e instanceof Error ? e.message : 'Unknown error',
        state: state?.substring(0, 100),
        timestamp: new Date().toISOString()
      });
      res.status(400).send(`
        <h2>❌ Invalid Authorization Request</h2>
        <p>Invalid or expired state parameter</p>
        <p>Please try authenticating again.</p>
      `);
      return;
    }

    // Exchange authorization code for access token
    console.log('[oauth-callback] Exchanging code for tokens...');
    const tokenResponse = await exchangeCodeForTokens(code as string);
    console.log('[oauth-callback] Token exchange successful');

    // Create or find user (must be present from state/JWT)
    const userId = ensuredUserId as string;
    console.log('[oauth-callback] Finding/creating user:', userId);
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
    console.log('[oauth-callback] Storing tokens in database...');
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
    console.log('[oauth-callback] Linking Discord user...');
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
    const Query = z.object({ userId: z.string() });
    const parsed = Query.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid query', details: parsed.error.flatten() });
      return;
    }
    const rawUserId = String(parsed.data.userId);
    // Allow passing a Discord ID; map to internal userId if a DiscordUser exists
    const map = await prisma.discordUser.findUnique({ where: { discordId: rawUserId } });
    const userId = map?.userId || rawUserId;
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
    const Query = z.object({ userId: z.string() });
    const parsed = Query.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid query', details: parsed.error.flatten() });
      return;
    }
    const rawUserId = String(parsed.data.userId);
    const map = await prisma.discordUser.findUnique({ where: { discordId: rawUserId } });
    const userId = map?.userId || rawUserId;
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
