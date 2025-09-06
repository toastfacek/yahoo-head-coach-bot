import axios from 'axios';
import { Request, Response } from 'express';
import { z } from 'zod';

import { env } from '../config/env';
import { prisma } from '../db';
import { stateStore } from '../services/stateStore';
import { verifyJWT } from '../utils/jwt';

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
      const secret =
        process.env.OAUTH_STATE_JWT_SECRET || env.OAUTH_STATE_JWT_SECRET || 'dev-oauth-secret';
      const payload = verifyJWT<any>(String(state), secret);
      if (payload.purpose !== 'yahoo_oauth') throw new Error('Invalid state purpose');
      if (!payload.jti) throw new Error('Missing jti');
      // Do not require presence in stateStore at this step to avoid cross-instance issues
      console.log('[oauth-start] validated state', { jti: payload.jti, sub: payload.sub });
    } catch {
      res
        .status(400)
        .send('<h2>❌ Invalid Authorization Request</h2><p>Invalid or expired state parameter</p>');
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
    res.status(500).json({
      error: 'OAuth initialization failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
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
    let discordId: string | null = null;
    try {
      console.log('[oauth-callback] Starting state validation...');
      console.log('[oauth-callback] State parameter:', state?.substring(0, 50) + '...');

      // Try fallback state format first (base64url encoded JSON)
      try {
        const fallbackData = JSON.parse(Buffer.from(String(state), 'base64url').toString());
        if (fallbackData.fallback === true && fallbackData.discordId) {
          console.log('[oauth-callback] Using fallback state format:', {
            discordId: fallbackData.discordId,
            timestamp: fallbackData.timestamp,
          });
          discordId = String(fallbackData.discordId);
          ensuredUserId = discordId; // For fallback, use Discord ID as user ID
          console.log('[oauth-callback] Fallback state validation successful', {
            discordId,
            ensuredUserId,
          });
        } else {
          throw new Error('Not fallback format');
        }
      } catch {
        // Fallback failed, try JWT format
        console.log('[oauth-callback] Fallback state parsing failed, trying JWT format...');

        const secret =
          process.env.OAUTH_STATE_JWT_SECRET || env.OAUTH_STATE_JWT_SECRET || 'dev-oauth-secret';
        console.log(
          '[oauth-callback] Using secret:',
          secret === 'dev-oauth-secret' ? 'dev-default' : 'env-provided'
        );

        const payload = verifyJWT<any>(String(state), secret);
        console.log('[oauth-callback] JWT payload:', {
          purpose: payload.purpose,
          jti: payload.jti,
          sub: payload.sub,
          exp: payload.exp,
          iat: payload.iat,
        });

        if (payload.purpose !== 'yahoo_oauth') throw new Error('Invalid state purpose');
        if (!payload.jti) throw new Error('Missing jti');

        console.log('[oauth-callback] Attempting to consume state from store...');
        const rec = await stateStore.consume(payload.jti);
        console.log('[oauth-callback] State store result:', rec ? 'found' : 'not found');

        // Extract Discord ID from state store record or JWT subject
        discordId = String((rec && (rec as any).discordId) || payload.sub || '');
        ensuredUserId = discordId; // Use Discord ID as user ID for consistency
        console.log('[oauth-callback] Derived discordId and ensuredUserId from JWT:', {
          discordId,
          ensuredUserId,
        });

        if (!discordId || discordId === 'dev') throw new Error('Missing Discord ID');
        console.log('[oauth-callback] JWT state validation successful', {
          jti: payload.jti,
          discordId,
          ensuredUserId,
          hadState: !!rec,
        });
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error';

      console.error('[oauth-callback] State validation failed:', e);
      console.error('[oauth-callback] Error details:', {
        message: errorMessage,
        state: state?.substring(0, 100),
        timestamp: new Date().toISOString(),
        hasState: !!state,
        stateLength: state?.length || 0,
      });

      // Provide specific guidance based on error type
      let userMessage = '';
      if (errorMessage.includes('expired') || errorMessage.includes('timeout')) {
        userMessage = `
          <h2>⏰ Authentication Session Expired</h2>
          <p><strong>The authentication session expired before completion.</strong></p>
          <p>This can happen if you take too long between clicking the auth link and completing the Yahoo login.</p>
          <h3>To fix this:</h3>
          <ol>
            <li>Go back to Discord and run <code>/auth login</code> again</li>
            <li>Click the authentication link <strong>immediately</strong></li>
            <li>Complete the Yahoo login process quickly (within 1-2 minutes)</li>
          </ol>
        `;
      } else if (errorMessage.includes('Missing') || errorMessage.includes('Invalid')) {
        userMessage = `
          <h2>❌ Invalid Authentication Request</h2>
          <p><strong>The authentication request is invalid or corrupted.</strong></p>
          <p>This might be due to:</p>
          <ul>
            <li>An invalid or tampered authentication link</li>
            <li>Browser issues or cookies being blocked</li>
            <li>Network connectivity problems</li>
          </ul>
          <h3>To fix this:</h3>
          <ol>
            <li>Clear your browser cache and cookies</li>
            <li>Go back to Discord and run <code>/auth login</code> again</li>
            <li>Use the new authentication link</li>
          </ol>
        `;
      } else {
        userMessage = `
          <h2>❌ Authentication Error</h2>
          <p><strong>An unexpected error occurred during authentication.</strong></p>
          <p>Error: ${errorMessage}</p>
          <p>Please try authenticating again. If the problem persists, contact support.</p>
        `;
      }

      res.status(400).send(`
        ${userMessage}
        <script>
          setTimeout(() => {
            window.close();
          }, 8000);
        </script>
      `);
      return;
    }

    // Exchange authorization code for access token
    const exchangeStartTime = Date.now();
    console.log('[oauth-callback] Exchanging code for tokens...', {
      timestamp: new Date().toISOString(),
    });
    const tokenResponse = await exchangeCodeForTokens(code as string);
    const exchangeEndTime = Date.now();
    console.log('[oauth-callback] Token exchange successful', {
      duration: exchangeEndTime - exchangeStartTime,
      timestamp: new Date().toISOString(),
    });

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
    console.log('[oauth-callback] Linking Discord user...', { discordId, userId: user.id });
    try {
      if (!discordId) {
        console.warn(
          '[oauth-callback] No Discord ID available for linking, skipping Discord user creation'
        );
      } else {
        // Upsert DiscordUser by the actual discordId from state
        const existing = await prisma.discordUser.findUnique({ where: { discordId } });
        if (existing) {
          console.log('[oauth-callback] Updating existing Discord user record');
          await prisma.discordUser.update({
            where: { discordId },
            data: { userId: user.id, isAuthenticated: true },
          });
        } else {
          console.log('[oauth-callback] Creating new Discord user record');
          await prisma.discordUser.create({
            data: {
              discordId,
              discordUsername: discordId, // Default to Discord ID, can be updated later
              userId: user.id,
              isAuthenticated: true,
            },
          });
        }
        console.log('[oauth-callback] Discord user linking successful');
      }
    } catch (linkErr) {
      console.error('Failed to link Discord user during OAuth callback:', linkErr);
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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Provide specific guidance for authorization code expiration
    if (errorMessage.includes('expired')) {
      res.status(400).send(`
        <h2>⏰ Authorization Expired</h2>
        <p><strong>The authorization code expired before it could be processed.</strong></p>
        <p>This happens when there's too much delay between clicking the auth link and completing the Yahoo OAuth flow.</p>
        <h3>To fix this:</h3>
        <ol>
          <li>Go back to Discord and run <code>/auth login</code> again</li>
          <li>Click the authentication link <strong>immediately</strong></li>
          <li>Complete the Yahoo login process quickly</li>
          <li>Don't switch between tabs or apps during the process</li>
        </ol>
        <p><strong>Tip:</strong> The entire process should take less than 1-2 minutes.</p>
        <script>
          setTimeout(() => {
            window.close();
          }, 10000);
        </script>
      `);
    } else {
      res.status(500).send(`
        <h2>❌ OAuth Processing Failed</h2>
        <p>Error: ${errorMessage}</p>
        <p>Please try authenticating again.</p>
        <script>
          setTimeout(() => {
            window.close();
          }, 5000);
        </script>
      `);
    }
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

    console.log('[tokenStatus] Checking auth status for rawUserId:', rawUserId);

    // Allow passing a Discord ID; map to internal userId if a DiscordUser exists
    const map = await prisma.discordUser.findUnique({ where: { discordId: rawUserId } });
    const userId = map?.userId || rawUserId;

    console.log('[tokenStatus] Discord ID mapping result:', {
      rawUserId,
      foundDiscordUser: !!map,
      mappedUserId: map?.userId,
      finalUserId: userId,
      discordUserData: map ? {
        discordId: map.discordId,
        isAuthenticated: map.isAuthenticated,
        createdAt: map.createdAt?.toISOString(),
        updatedAt: map.updatedAt?.toISOString()
      } : null
    });

    const tok = await prisma.yahooToken.findUnique({ where: { userId } });

    console.log('[tokenStatus] Yahoo token lookup result:', {
      userId,
      foundToken: !!tok,
      expiresAt: tok?.expiresAt?.toISOString(),
      scope: tok?.scope,
      tokenType: tok?.tokenType,
      isExpired: tok ? tok.expiresAt.getTime() < Date.now() : null,
      currentTime: new Date().toISOString()
    });

    if (!tok) {
      console.log('[tokenStatus] No token found, returning not authenticated');
      res.json({ authenticated: false, userId });
      return;
    }
    
    const msLeft = tok.expiresAt.getTime() - Date.now();
    const isTokenExpired = msLeft <= 0;

    console.log('[tokenStatus] Token expiry check:', {
      tokenExpiry: tok.expiresAt.toISOString(),
      currentTime: new Date().toISOString(),
      msLeft,
      isTokenExpired
    });

    if (isTokenExpired) {
      console.log('[tokenStatus] Token expired, returning not authenticated');
      res.json({ 
        authenticated: false, 
        userId,
        reason: 'token_expired',
        expiresAt: tok.expiresAt.toISOString()
      });
      return;
    }

    console.log('[tokenStatus] Token found and valid, returning authenticated');
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
    console.error('[tokenStatus] Error occurred:', error);
    res.status(500).json({ 
      error: 'Failed to fetch token status',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
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
      const errorDescription = error.response?.data?.error_description || error.message;

      // Handle specific error types
      if (error.response?.data?.error === 'invalid_grant') {
        if (errorDescription.includes('expired')) {
          throw new Error(
            'Authorization code expired. Please try authenticating again immediately after clicking the link.'
          );
        } else {
          throw new Error('Authorization code is invalid. Please try authenticating again.');
        }
      }

      throw new Error(`Token exchange failed: ${errorDescription}`);
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
