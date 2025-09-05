import express from 'express';

export function startHealthServer() {
  const app = express();
  // Railway injects PORT env var - use it if available, fallback to DISCORD_HEALTH_PORT or 8081
  const port = Number(process.env.PORT || process.env.DISCORD_HEALTH_PORT || 8081);

  // Simple health endpoints
  app.get('/', (_req, res) => res.status(200).json({ status: 'ok', service: 'discord-bot' }));
  app.get('/health', (_req, res) => res.status(200).json({ status: 'ok', service: 'discord-bot' }));
  
  // Add error handling middleware
  app.use((err: any, _req: any, res: any, _next: any) => {
    console.error('Health server error:', err);
    res.status(500).json({ status: 'error', service: 'discord-bot', error: err.message });
  });

  const server = app.listen(port, '0.0.0.0', () => {
    // eslint-disable-next-line no-console
    console.log(`Discord health server listening on 0.0.0.0:${port}`);
  });

  // Handle server errors
  server.on('error', (err) => {
    console.error('Health server failed to start:', err);
  });

  return server;
}

