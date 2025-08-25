import { prisma } from '../db';

export async function record(input: { leagueId: string; payload: any }) {
  try {
    const { leagueId, payload } = input;
    const entry = await prisma.signal.create({
      data: {
        leagueId,
        kind: 'report',
        payload: payload as any,
        source: 'headcoach',
      },
    });
    return { recorded: true, id: entry.id };
  } catch (err: any) {
    console.error('Historian error:', err);
    return { recorded: false, error: err?.message || 'record_failed' };
  }
}
