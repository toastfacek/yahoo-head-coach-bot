import { Request, Response } from 'express';
import axios from 'axios';
import { prisma } from '../db';
import crypto from 'crypto';

// Use shared Prisma client

// In-memory state storage for CSRF protection (in production, use Redis or database)
const stateStore = new Map<string, { timestamp: number; userId?: string }>();

// Cleanup old states every hour
setInterval(() => {
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;
  
  for (const [state, data] of stateStore.entries()) {
    if (now - data.timestamp > oneHour) {
      stateStore.delete(state);
    }
  }
}, 60 * 60 * 1000);

/**
 * Start OAuth flow - redirect user to Yahoo authorization server
 */
export async function oauthStart(req: Request, res: Response): Promise<void> {
  try {
    const { userId } = req.query;
    
    // Generate secure state parameter for CSRF protection
    const state = crypto.randomBytes(32).toString('hex');
    
    // Store state with timestamp for validation
    stateStore.set(state, {
      timestamp: Date.now(),
      userId: userId as string || 'dev' // Default to 'dev' user for MVP
    });
    
    // Build Yahoo OAuth authorization URL
    const authUrl = new URL('https://api.login.yahoo.com/oauth2/request_auth');
    authUrl.searchParams.append('client_id', process.env.YAHOO_CLIENT_ID!);
    authUrl.searchParams.append('redirect_uri', process.env.YAHOO_REDIRECT_URI!);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('scope', 'fspt-w'); // Fantasy Sports Read/Write
    authUrl.searchParams.append('state', state);
    
    console.log('Redirecting to Yahoo OAuth:', authUrl.toString());
    
    // Redirect user to Yahoo authorization page
    res.redirect(authUrl.toString());
    
  } catch (error) {
    console.error('OAuth start error:', error);
    res.status(500).json({
      error: 'OAuth initialization failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Handle OAuth callback - exchange authorization code for tokens
 */
export async function oauthCallback(req: Request, res: Response): Promise<void> {
  try {
    const { code, state, error: oauthError } = req.query;
    
    // Handle OAuth denial or error
    if (oauthError) {
      console.error('OAuth error from Yahoo:', oauthError);
      res.status(400).json({
        error: 'OAuth authorization failed',
        details: oauthError
      });
      return;
    }
    
    // Validate required parameters
    if (!code || !state) {
      res.status(400).json({
        error: 'Missing required OAuth parameters',
        message: 'Authorization code and state are required'
      });
      return;
    }
    
    // Validate state parameter (CSRF protection)
    const stateData = stateStore.get(state as string);
    if (!stateData) {
      res.status(400).json({
        error: 'Invalid or expired state parameter',
        message: 'Possible CSRF attack or expired authorization request'
      });
      return;
    }
    
    // Remove used state
    stateStore.delete(state as string);
    
    // Exchange authorization code for access token
    const tokenResponse = await exchangeCodeForTokens(code as string);
    
    // Create or find user
    const userId = stateData.userId || 'dev';
    let user = await prisma.user.findUnique({
      where: { id: userId }
    });
    
    if (!user) {
      user = await prisma.user.create({
        data: {
          id: userId,
          email: `${userId}@example.com` // Placeholder email
        }
      });
    }
    
    // Calculate token expiration
    const expiresAt = new Date(Date.now() + (tokenResponse.expires_in * 1000));
    
    // Store or update tokens in database
    await prisma.yahooToken.upsert({
      where: { userId: user.id },
      update: {
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
        expiresAt,
        tokenType: tokenResponse.token_type || 'bearer',
        scope: tokenResponse.scope || 'fspt-w'
      },
      create: {
        userId: user.id,
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
        expiresAt,
        tokenType: tokenResponse.token_type || 'bearer',
        scope: tokenResponse.scope || 'fspt-w'
      }
    });
    
    console.log(`OAuth tokens stored successfully for user: ${userId}`);
    
    // Success response
    res.json({
      success: true,
      message: 'OAuth authorization completed successfully',
      userId: user.id,
      tokenExpires: expiresAt.toISOString(),
      scope: tokenResponse.scope || 'fspt-w'
    });
    
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).json({
      error: 'OAuth callback processing failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Simple token status for a user
 */
export async function tokenStatus(req: Request, res: Response): Promise<void> {
  try {
    const userId = String((req.query as any).userId || 'dev');
    const tok = await prisma.yahooToken.findUnique({ where: { userId } });
    if (!tok) {
      res.json({ userId, hasToken: false });
      return;
    }
    const msLeft = tok.expiresAt.getTime() - Date.now();
    res.json({
      userId,
      hasToken: true,
      expiresAt: tok.expiresAt.toISOString(),
      expiresInSeconds: Math.max(Math.floor(msLeft / 1000), 0),
      scope: tok.scope,
      tokenType: tok.tokenType
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
    const userId = String((req.query as any).userId || 'dev');
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
    grant_type: 'authorization_code'
  });
  
  // Create Basic Auth header (alternative to form data approach)
  const credentials = Buffer.from(
    `${process.env.YAHOO_CLIENT_ID}:${process.env.YAHOO_CLIENT_SECRET}`
  ).toString('base64');
  
  try {
    const response = await axios.post(tokenUrl, formData.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`,
        'User-Agent': 'Yahoo Fantasy HeadCoach Bot/1.0'
      }
    });
    
    if (!response.data.access_token) {
      throw new Error('No access token received from Yahoo');
    }
    
    return {
      access_token: response.data.access_token,
      refresh_token: response.data.refresh_token,
      expires_in: response.data.expires_in || 3600, // Default 1 hour
      token_type: response.data.token_type || 'bearer',
      scope: response.data.scope
    };
    
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('Yahoo token exchange error:', error.response?.data);
      throw new Error(`Token exchange failed: ${error.response?.data?.error_description || error.message}`);
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
      where: { userId }
    });
    
    if (!tokenRecord || !tokenRecord.refreshToken) {
      throw new Error('No refresh token found for user');
    }
    
    const tokenUrl = 'https://api.login.yahoo.com/oauth2/get_token';
    
    const formData = new URLSearchParams({
      client_id: process.env.YAHOO_CLIENT_ID!,
      client_secret: process.env.YAHOO_CLIENT_SECRET!,
      refresh_token: tokenRecord.refreshToken,
      grant_type: 'refresh_token'
    });
    
    const credentials = Buffer.from(
      `${process.env.YAHOO_CLIENT_ID}:${process.env.YAHOO_CLIENT_SECRET}`
    ).toString('base64');
    
    const response = await axios.post(tokenUrl, formData.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`,
        'User-Agent': 'Yahoo Fantasy HeadCoach Bot/1.0'
      }
    });
    
    const expiresAt = new Date(Date.now() + (response.data.expires_in * 1000));
    
    // Update tokens in database
    await prisma.yahooToken.update({
      where: { userId },
      data: {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token || tokenRecord.refreshToken, // Keep old refresh token if new one not provided
        expiresAt,
        tokenType: response.data.token_type || 'bearer',
        scope: response.data.scope || tokenRecord.scope
      }
    });
    
    console.log(`Tokens refreshed successfully for user: ${userId}`);
    
  } catch (error) {
    console.error('Token refresh error:', error);
    throw error;
  }
}
