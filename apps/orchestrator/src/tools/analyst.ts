// Analyst tool: turn signals/roster into normalized actions with confidence
// Strategy (MVP):
// - Prefer the roster provided by scout() to avoid re-fetching
// - Heuristic lineup suggestions based on injury status + position eligibility
// - Confidence tiers: OUT (0.90), Doubtful (0.82), Questionable (0.70)
import { yfForUser, getGameKey, leagueKeyFor, userTeamKey } from '../services/yahoo';

type AnalystInput = { leagueId: string; userId?: string; window?: string; scout?: any };

// Map common flex slots to eligible base positions
const FLEX_MAP: Record<string, string[]> = {
  'W/R/T': ['WR', 'RB', 'TE'],
  'WR/RB': ['WR', 'RB'],
  'Q/W/R/T': ['QB', 'WR', 'RB', 'TE'],
  'FLEX': ['WR', 'RB', 'TE'],
};

// Can a player with eligible positions fill a lineup slot (including flex rules)?
function canFill(slot: string, eligible: string[]): boolean {
  if (!slot) return false;
  if (eligible.includes(slot)) return true;
  const flex = FLEX_MAP[slot];
  return Array.isArray(flex) && flex.some((p) => eligible.includes(p));
}

export async function analyze(input: AnalystInput) {
  const { leagueId, userId = 'dev' } = input;

  // Prefer scout-fed roster to avoid re-fetch
  let roster: any[] | null = input.scout?.roster ?? null;

  if (!roster) {
    try {
      const yf = await yfForUser(userId);
      const gameKey = await getGameKey(yf, 'nfl');
      const leagueKey = leagueKeyFor(gameKey, leagueId);
      const teamKey = await userTeamKey(yf, gameKey, leagueKey);
      if (teamKey) {
        const team = await (yf as any).team.roster(teamKey);
        roster = team?.roster || null;
      }
    } catch (e) {
      // ignore — will fall back to empty
    }
  }

  roster = Array.isArray(roster) ? roster : [];

  // Partition starters vs bench (Yahoo marks bench as BN)
  const starters = roster.filter((p: any) => p.selected_position && p.selected_position !== 'BN');
  const bench = roster.filter((p: any) => !p.selected_position || p.selected_position === 'BN');

  const actions: any[] = [];

  // Basic injury flags used for heuristics
  const isOut = (s?: string) => /^(O|OUT|IR|PUP|NFI|SUSP)$/i.test(s || '');
  const isDoubtful = (s?: string) => /^(D|Doubtful)$/i.test(s || '');
  const isQuestionable = (s?: string) => /^(Q|Questionable)$/i.test(s || '');

  for (const sp of starters) {
    const slot = sp.selected_position as string;
    const status = sp.status || '';
    const benchCandidates = bench.filter(
      (bp: any) => Array.isArray(bp.eligible_positions) && canFill(slot, bp.eligible_positions)
    );

    // OUT -> strong swap recommendation
    if (isOut(status) && benchCandidates.length > 0) {
      const bp = benchCandidates[0];
      actions.push({
        id: `${sp.player_id}->${bp.player_id}`,
        type: 'LINEUP_SWAP',
        summary: `Start ${bp.name} in ${slot} over ${sp.name} (OUT)`,
        confidence: 0.9,
        reason: 'INJURY_OUT',
        swap: { out: sp, in: bp, slot },
      });
      continue;
    }

    // Doubtful -> medium-high recommendation
    if (isDoubtful(status) && benchCandidates.length > 0) {
      const bp = benchCandidates[0];
      actions.push({
        id: `${sp.player_id}->${bp.player_id}`,
        type: 'LINEUP_SWAP',
        summary: `Consider ${bp.name} in ${slot} over ${sp.name} (Doubtful)`,
        confidence: 0.82,
        reason: 'INJURY_RISK',
        swap: { out: sp, in: bp, slot },
      });
      continue;
    }

    // Questionable -> soft recommendation (monitor)
    if (isQuestionable(status) && benchCandidates.length > 0) {
      const bp = benchCandidates[0];
      actions.push({
        id: `${sp.player_id}->${bp.player_id}`,
        type: 'LINEUP_SWAP',
        summary: `Monitor: ${bp.name} in ${slot} over ${sp.name} (Questionable)`,
        confidence: 0.7,
        reason: 'INJURY_RISK',
        swap: { out: sp, in: bp, slot },
      });
      continue;
    }
  }

  // Return a human-readable analysis + normalized recommendations array
  return {
    analysis: `Evaluated ${starters.length} starters against ${bench.length} bench candidates. Found ${actions.length} lineup swaps.`,
    recommendations: actions,
  };
}
