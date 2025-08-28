// Recall tool: fetch recent memory (signals), recommendations, and decisions
import { z } from 'zod';

import { getRecentSignals, getRecentRecommendations, getRecentDecisions } from './historian';

export const RecallInput = z.object({
  leagueId: z.string(),
  kinds: z.array(z.string()).optional(),
  includeRecommendations: z.boolean().optional(),
  includeDecisions: z.boolean().optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

export async function recall(input: z.infer<typeof RecallInput>) {
  const { leagueId, kinds, includeRecommendations, includeDecisions, limit = 5 } = input;
  const signals = await getRecentSignals({ leagueId, kinds, limit });
  const recs = includeRecommendations ? await getRecentRecommendations({ leagueId, limit }) : [];
  const decisions = includeDecisions ? await getRecentDecisions({ leagueId, limit }) : [];

  // Return a trimmed payload to keep tokens low
  return {
    signals: signals.map((s) => ({ id: s.id, kind: s.kind, asOf: s.asOf, source: s.source })),
    recommendations: recs.map((r) => ({
      id: r.id,
      type: r.type,
      status: r.status,
      confidence: r.confidence,
      createdAt: r.createdAt,
    })),
    decisions: decisions.map((d) => ({ id: d.id, action: d.action, executedAt: d.executedAt })),
  };
}
