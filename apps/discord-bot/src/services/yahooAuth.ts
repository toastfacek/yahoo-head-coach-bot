import axios from 'axios';
import crypto from 'crypto';
import { env } from '../utils/config';
import { authLogger } from '../utils/logger';

interface YahooTokenData {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope?: string;
  xoauth_yahoo_guid?: string;
}

interface StoredToken {
  userId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  tokenType: string;
  scope?: string;
  yahooGuid?: string;
  createdAt: Date;
  updatedAt: Date;
}

export class YahooAuthService {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly encryptionKey: string;

  constructor() {
    this.clientId = env.YAHOO_CLIENT_ID;
    this.clientSecret = env.YAHOO_CLIENT_SECRET;
    this.redirectUri = env.YAHOO_REDIRECT_URI;
    
    // Use a consistent encryption key - in production this should be from env
    this.encryptionKey = env.ENCRYPTION_KEY || 'default-key-change-in-production';
  }

  /**
   * Generate Yahoo OAuth URL for a Discord user
   */
  generateAuthUrl(discordUserId: string): string {
    // Create state token with Discord user ID and timestamp
    const stateData = {
      discordUserId,
      timestamp: Date.now(),
      nonce: crypto.randomBytes(16).toString('hex')
    };
    
    const state = Buffer.from(JSON.stringify(stateData)).toString('base64url');
    
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: 'fspt-w', // Fantasy Sports Read/Write
      state: state
    });

    return `https://api.login.yahoo.com/oauth2/request_auth?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(code: string, state: string): Promise<{ success: boolean; userId?: string; error?: string }> {
    try {
      // Verify and decode state
      const stateData = JSON.parse(Buffer.from(state, 'base64url').toString());
      const { discordUserId, timestamp } = stateData;
      
      // Check if state is not too old (5 minutes)
      if (Date.now() - timestamp > 5 * 60 * 1000) {
        return { success: false, error: 'Authentication expired, please try again' };
      }

      // Exchange code for token
      const tokenResponse = await axios.post(
        'https://api.login.yahoo.com/oauth2/get_token',
        new URLSearchParams({
          grant_type: 'authorization_code',
          code: code,
          client_id: this.clientId,
          client_secret: this.clientSecret,
          redirect_uri: this.redirectUri
        }),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 10000
        }
      );

      const tokenData: YahooTokenData = tokenResponse.data;
      
      // Store the token for this user
      await this.storeToken(discordUserId, tokenData);
      
      authLogger.info({ discordUserId }, 'Successfully stored Yahoo token for user');
      return { success: true, userId: discordUserId };
      
    } catch (error: any) {
      authLogger.error({ error: error.message }, 'Failed to exchange code for token');
      return { success: false, error: 'Failed to complete authentication' };
    }
  }

  /**
   * Store token in database (plaintext for cross-service compatibility)
   * Note: Orchestrator stores tokens plaintext. We keep the same format so both services can read them.
   */
  private async storeToken(discordUserId: string, tokenData: YahooTokenData): Promise<void> {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();

    try {
      const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);
      
      await prisma.yahooToken.upsert({
        where: { userId: discordUserId },
        update: {
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token,
          expiresAt: expiresAt,
          tokenType: tokenData.token_type,
          scope: tokenData.scope,
          yahooGuid: tokenData.xoauth_yahoo_guid,
          updatedAt: new Date()
        },
        create: {
          userId: discordUserId,
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token,
          expiresAt: expiresAt,
          tokenType: tokenData.token_type,
          scope: tokenData.scope,
          yahooGuid: tokenData.xoauth_yahoo_guid,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      });
    } finally {
      await prisma.$disconnect();
    }
  }

  /**
   * Get stored token for a user
   */
  async getToken(discordUserId: string): Promise<StoredToken | null> {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();

    try {
      const tokenRecord = await prisma.yahooToken.findUnique({
        where: { userId: discordUserId }
      });

      if (!tokenRecord) {
        return null;
      }

      return {
        userId: tokenRecord.userId,
        accessToken: tokenRecord.accessToken,
        refreshToken: tokenRecord.refreshToken,
        expiresAt: tokenRecord.expiresAt,
        tokenType: tokenRecord.tokenType,
        scope: tokenRecord.scope || undefined,
        yahooGuid: tokenRecord.yahooGuid || undefined,
        createdAt: tokenRecord.createdAt,
        updatedAt: tokenRecord.updatedAt
      };
    } finally {
      await prisma.$disconnect();
    }
  }

  /**
   * Refresh an expired token
   */
  async refreshToken(discordUserId: string): Promise<boolean> {
    try {
      const storedToken = await this.getToken(discordUserId);
      if (!storedToken) {
        authLogger.warn({ discordUserId }, 'No stored token found for refresh');
        return false;
      }

      const response = await axios.post(
        'https://api.login.yahoo.com/oauth2/get_token',
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: storedToken.refreshToken,
          client_id: this.clientId,
          client_secret: this.clientSecret,
          redirect_uri: this.redirectUri
        }),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 10000
        }
      );

      const tokenData: YahooTokenData = response.data;
      
      // Store the refreshed token (plaintext)
      await this.storeToken(discordUserId, tokenData);
      
      authLogger.info({ discordUserId }, 'Successfully refreshed Yahoo token');
      return true;
      
    } catch (error: any) {
      authLogger.error({ error: error.message, discordUserId }, 'Failed to refresh token');
      return false;
    }
  }

  /**
   * Check if user has valid token
   */
  async isAuthenticated(discordUserId: string): Promise<boolean> {
    try {
      const token = await this.getToken(discordUserId);
      if (!token) {
        return false;
      }

      // If token is expired, try to refresh it
      if (token.expiresAt <= new Date()) {
        return await this.refreshToken(discordUserId);
      }

      return true;
    } catch (error) {
      authLogger.error({ error, discordUserId }, 'Error checking authentication status');
      return false;
    }
  }

  /**
   * Get valid access token, refreshing if necessary
   */
  async getValidAccessToken(discordUserId: string): Promise<string | null> {
    try {
      let token = await this.getToken(discordUserId);
      if (!token) {
        return null;
      }

      // If token is expired, refresh it
      if (token.expiresAt <= new Date()) {
        const refreshed = await this.refreshToken(discordUserId);
        if (!refreshed) {
          return null;
        }
        // Get the refreshed token
        token = await this.getToken(discordUserId);
        if (!token) {
          return null;
        }
      }

      return token.accessToken;
    } catch (error) {
      authLogger.error({ error, discordUserId }, 'Error getting valid access token');
      return null;
    }
  }

  /**
   * Remove stored token (logout)
   */
  async removeToken(discordUserId: string): Promise<boolean> {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();

    try {
      await prisma.yahooToken.delete({
        where: { userId: discordUserId }
      });
      return true;
    } catch (error) {
      authLogger.error({ error, discordUserId }, 'Error removing token');
      return false;
    } finally {
      await prisma.$disconnect();
    }
  }

  /**
   * AES-256-GCM encryption for storing sensitive data
   */
  private encrypt(text: string): string {
    const algorithm = 'aes-256-gcm';
    const key = crypto.createHash('sha256').update(this.encryptionKey).digest();
    const iv = crypto.randomBytes(12); // GCM recommended IV size
    const cipher = crypto.createCipherGCM(algorithm, key, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    // Format: iv:authTag:encrypted
    return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
  }

  /**
   * AES-256-GCM decryption for retrieving sensitive data
   */
  private decrypt(encryptedText: string): string {
    const algorithm = 'aes-256-gcm';
    const key = crypto.createHash('sha256').update(this.encryptionKey).digest();
    
    const [ivHex, authTagHex, encrypted] = encryptedText.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    
    const decipher = crypto.createDecipherGCM(algorithm, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
}

// Export singleton instance
export const yahooAuth = new YahooAuthService();
