import { yfForUser, getGameKey, leagueKeyFor, userTeamKey, isLeaguePostDraft } from '../services/yahoo';

type ScoutPlayer = {
  player_id: string | number;
  name: string;
  status?: string;
  selected_position?: string;
  eligible_positions?: string[];
};

export async function scout({ leagueId, userId = 'dev' }: { leagueId: string; userId?: string }) {
  try {
    const yf = await yfForUser(userId);
    const gameKey = await getGameKey(yf, 'nfl');
    const leagueKey = leagueKeyFor(gameKey, leagueId);
    const teamKey = await userTeamKey(yf, gameKey, leagueKey);

    if (!teamKey) {
      return { message: 'Unable to resolve team key for user in this league', leagueKey };
    }

    const postDraft = await isLeaguePostDraft(yf, leagueKey);
    const team = await (yf as any).team.roster(teamKey);
    const roster: ScoutPlayer[] = (team?.roster || []).map((p: any) => ({
      player_id: p.player_id || p.player_key || p.playerId,
      name: p.name?.full || p.name || '',
      status: p.status,
      selected_position: p.selected_position,
      eligible_positions: p.eligible_positions || [],
    }));

    const injuries = {
      out: roster.filter((p) => /^(O|OUT)$/i.test(p.status || '')),
      doubtful: roster.filter((p) => /^(D|Doubtful)$/i.test(p.status || '')),
      questionable: roster.filter((p) => /^(Q|Questionable)$/i.test(p.status || '')),
      ir: roster.filter((p) => /IR|PUP|NFI|SUSP/i.test(p.status || '')),
    };

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
