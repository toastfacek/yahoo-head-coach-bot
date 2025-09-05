import express from 'express';

export function startHealthServer() {
  const app = express();
  const port = Number(process.env.PORT || 8081);

  app.get('/', (_req, res) => res.status(200).json({ status: 'ok', service: 'discord-bot' }));
  app.get('/health', (_req, res) => res.status(200).json({ status: 'ok', service: 'discord-bot' }));

  const server = app.listen(port, '0.0.0.0', () => {
    // eslint-disable-next-line no-console
    console.log(`Discord health server listening on ${port}`);
  });

  return server;
}

