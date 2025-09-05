import express from 'express';

export function startHealthServer() {
  try {
    const app = express();
    // Railway sets PORT automatically, fall back to DISCORD_HEALTH_PORT for local dev
    const port = Number(process.env.PORT || process.env.DISCORD_HEALTH_PORT || 8081);
    const host = '0.0.0.0'; // Required for Railway health checks

    console.log(`🏥 Starting health server on ${host}:${port}...`);

    // Health check endpoints
    app.get('/', (_req, res) => {
      res.status(200).json({ 
        status: 'ok', 
        service: 'discord-bot',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      });
    });
    
    app.get('/health', (_req, res) => {
      res.status(200).json({ 
        status: 'ok', 
        service: 'discord-bot',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      });
    });

    // Error handling middleware
    app.use((err: any, _req: any, res: any, _next: any) => {
      console.error('Health server error:', err);
      res.status(500).json({ status: 'error', message: 'Internal server error' });
    });

    const server = app.listen(port, host, () => {
      console.log(`✅ Discord health server listening on ${host}:${port}`);
    });

    // Handle server errors
    server.on('error', (err) => {
      console.error('❌ Health server error:', err);
      if (err.message.includes('EADDRINUSE')) {
        console.error(`🚨 Port ${port} is already in use. Check if another service is running.`);
      }
    });

    return server;
  } catch (error) {
    console.error('❌ Failed to start health server:', error);
    // Don't throw - keep the bot running even if health server fails
    return null;
  }
}

