// Scout tool: gather roster + injury signals for the authenticated user's team
// Notes:
// - Read-only Yahoo calls using bearer auth from stored tokens
// - Produces a normalized payload that the analyst tool can use directly
import { yfForUser, getGameKey, leagueKeyFor, userTeamKey, isLeaguePostDraft } from '../services/yahoo';

// Minimal shape we care about for downstream logic
type ScoutPlayer = {
  player_id: string | number;
  name: string;
  status?: string;
  selected_position?: string;
  eligible_positions?: string[];
};

export async function scout({ leagueId, userId = 'dev' }: { leagueId: string; userId?: string }) {
  try {
    // 1) Build Yahoo client with persisted tokens (auto-refresh persisted)
    const yf = await yfForUser(userId);
    // 2) Resolve keys needed for queries (nfl game, league_key, team_key)
    const gameKey = await getGameKey(yf, 'nfl');
    const leagueKey = leagueKeyFor(gameKey, leagueId);
    const teamKey = await userTeamKey(yf, gameKey, leagueKey);

    if (!teamKey) {
      return { message: 'Unable to resolve team key for user in this league', leagueKey };
    }

    // 3) Confirm draft status and fetch current roster
    const postDraft = await isLeaguePostDraft(yf, leagueKey);
    const team = await (yf as any).team.roster(teamKey);
    const roster: ScoutPlayer[] = (team?.roster || []).map((p: any) => ({
      player_id: p.player_id || p.player_key || p.playerId,
      name: p.name?.full || p.name || '',
      status: p.status,
      selected_position: p.selected_position,
      eligible_positions: p.eligible_positions || [],
    }));

    // 4) Derive quick injury buckets for downstream rules
    const injuries = {
      out: roster.filter((p) => /^(O|OUT)$/i.test(p.status || '')),
      doubtful: roster.filter((p) => /^(D|Doubtful)$/i.test(p.status || '')),
      questionable: roster.filter((p) => /^(Q|Questionable)$/i.test(p.status || '')),
      ir: roster.filter((p) => /IR|PUP|NFI|SUSP/i.test(p.status || '')),
    };

    // Final payload consumed by analyst
    return {
      leagueKey,
      teamKey,
      postDraft,
      roster,
      injuries,
      asOf: new Date().toISOString(),
    };
  } catch (err: any) {
    console.error('Scout error:', err);
    return { message: err?.message || 'Scout failed' };
  }
}
