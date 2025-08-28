import express from 'express';

export function startHealthServer() {
  const app = express();
  const port = Number(process.env.PORT || 3000);

  app.get('/', (_req, res) => res.status(200).json({ status: 'ok', service: 'discord-bot' }));
  app.get('/health', (_req, res) => res.status(200).json({ status: 'ok', service: 'discord-bot' }));

  const server = app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Discord health server listening on ${port}`);
  });

  return server;
}

