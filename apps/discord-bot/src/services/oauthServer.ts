import express from 'express';
import { yahooAuth } from './yahooAuth';
import { authLogger } from '../utils/logger';

interface OAuthServer {
  start(): Promise<void>;
  stop(): Promise<void>;
}

class SimpleOAuthServer implements OAuthServer {
  private app: express.Application;
  private server: any;
  private port: number;

  constructor(port: number = 3001) {
    this.port = port;
    this.app = express();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // OAuth callback endpoint
    this.app.get('/oauth/callback', async (req, res) => {
      const { code, state, error } = req.query;

      if (error) {
        authLogger.error({ error }, 'OAuth error received');
        return res.status(400).send(`
          <html>
            <body style="font-family: Arial, sans-serif; text-align: center; margin-top: 100px;">
              <h2>❌ Authentication Failed</h2>
              <p>Yahoo authentication was cancelled or failed.</p>
              <p>You can close this window and try again in Discord.</p>
            </body>
          </html>
        `);
      }

      if (!code || !state) {
        authLogger.error({ code: !!code, state: !!state }, 'Missing code or state in callback');
        return res.status(400).send(`
          <html>
            <body style="font-family: Arial, sans-serif; text-align: center; margin-top: 100px;">
              <h2>❌ Authentication Failed</h2>
              <p>Missing required authentication parameters.</p>
              <p>You can close this window and try again in Discord.</p>
            </body>
          </html>
        `);
      }

      try {
        const result = await yahooAuth.exchangeCodeForToken(code as string, state as string);
        
        if (result.success && result.userId) {
          authLogger.info({ userId: result.userId }, 'OAuth callback successful');
          return res.send(`
            <html>
              <head>
                <title>Authentication Successful</title>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
              </head>
              <body style="font-family: Arial, sans-serif; text-align: center; margin-top: 100px; padding: 20px;">
                <h2>✅ Authentication Successful!</h2>
                <p>Your Yahoo Fantasy Football account has been connected.</p>
                <p>You can now close this window and return to Discord to use fantasy commands.</p>
                <div style="margin-top: 30px; padding: 20px; background-color: #f0f8ff; border-radius: 8px; max-width: 400px; margin: 30px auto;">
                  <h3>Next Steps:</h3>
                  <p>• Return to Discord</p>
                  <p>• Use <code>/auth status</code> to verify your connection</p>
                  <p>• Try commands like <code>/leagues</code> or <code>/standings</code></p>
                </div>
              </body>
            </html>
          `);
        } else {
          authLogger.error({ error: result.error }, 'Token exchange failed');
          return res.status(500).send(`
            <html>
              <body style="font-family: Arial, sans-serif; text-align: center; margin-top: 100px;">
                <h2>❌ Authentication Failed</h2>
                <p>${result.error || 'Unknown error occurred'}</p>
                <p>You can close this window and try again in Discord.</p>
              </body>
            </html>
          `);
        }
      } catch (error) {
        authLogger.error({ error }, 'Unexpected error in OAuth callback');
        return res.status(500).send(`
          <html>
            <body style="font-family: Arial, sans-serif; text-align: center; margin-top: 100px;">
              <h2>❌ Authentication Failed</h2>
              <p>An unexpected error occurred. Please try again.</p>
              <p>You can close this window and try again in Discord.</p>
            </body>
          </html>
        `);
      }
    });

    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // Root endpoint with basic info
    this.app.get('/', (req, res) => {
      res.send(`
        <html>
          <body style="font-family: Arial, sans-serif; text-align: center; margin-top: 100px;">
            <h2>Yahoo Fantasy HeadCoach Bot</h2>
            <p>OAuth service is running</p>
          </body>
        </html>
      `);
    });
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.port, () => {
        authLogger.info({ port: this.port }, 'OAuth server started');
        resolve();
      }).on('error', (error) => {
        authLogger.error({ error, port: this.port }, 'Failed to start OAuth server');
        reject(error);
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          authLogger.info({ port: this.port }, 'OAuth server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

// Export singleton instance
export const oauthServer = new SimpleOAuthServer();