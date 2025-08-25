import { Request, Response } from 'express';
import { runHeadCoach } from '../agents/headCoach';

export async function dailyReport(req: Request, res: Response) {
  const leagueId = String((req.query as any).leagueId || '');
  const userId = String((req.query as any).userId || 'dev');
  if (!leagueId) {
    res.status(400).json({ error: 'leagueId is required' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  // flush headers early for proxies
  if (typeof (res as any).flushHeaders === 'function') (res as any).flushHeaders();

  let closed = false;
  const heartbeat = setInterval(() => {
    if (closed) return;
    res.write(`: keepalive\n\n`);
  }, 15000);

  req.on('close', () => {
    closed = true;
    clearInterval(heartbeat);
  });

  try {
    const stream = await runHeadCoach({ leagueId, userId, intent: 'DAILY_REPORT' });
    for await (const chunk of (stream as any).textStream) {
      if (closed) break;
      res.write(`data: ${chunk}\n\n`);
    }
    if (!closed) {
      res.write('event: done\ndata: {}\n\n');
      res.end();
    }
  } catch (error: any) {
    console.error('dailyReport error:', error);
    if (!closed) {
      const payload = JSON.stringify({ message: error?.message || 'Agent error' });
      res.write(`event: error\ndata: ${payload}\n\n`);
      res.end();
    }
  } finally {
    clearInterval(heartbeat);
  }
}
