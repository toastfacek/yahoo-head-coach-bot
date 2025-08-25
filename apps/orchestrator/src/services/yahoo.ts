import { prisma } from '../db';
import YahooFantasy from 'yahoo-fantasy';
import { env } from '../config/env';

export async function yfForUser(userId: string) {
  const tok = await prisma.yahooToken.findUnique({ where: { userId } });
  if (!tok) throw new Error('Missing Yahoo token for user');

  const onRefresh = async (tokenData: any) => {
    try {
      const expiresAt = tokenData.expires_in
        ? new Date(Date.now() + tokenData.expires_in * 1000)
        : new Date(Date.now() + 55 * 60 * 1000);
      await prisma.yahooToken.update({
        where: { userId },
        data: {
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token ?? tok.refreshToken,
          expiresAt,
          tokenType: tokenData.token_type ?? tok.tokenType,
          scope: tokenData.scope ?? tok.scope,
        },
      });
    } catch (e) {
      console.error('Failed to persist refreshed Yahoo tokens:', e);
    }
  };

  const yf = new (YahooFantasy as any)(env.YAHOO_CLIENT_ID, env.YAHOO_CLIENT_SECRET, onRefresh, env.YAHOO_REDIRECT_URI);
  yf.setUserToken(tok.accessToken);
  yf.setRefreshToken(tok.refreshToken);
  return yf as any;
}

export async function getGameKey(yf: any, code = 'nfl'): Promise<string> {
  const meta = await yf.game.meta(code);
  return String(meta.game_key);
}

export function leagueKeyFor(gameKey: string, leagueId: string | number) {
  return `${gameKey}.l.${leagueId}`;
}

export async function userTeamKey(yf: any, gameKey: string, leagueKey: string): Promise<string | null> {
  const user = await yf.user.game_teams(gameKey);
  const teams = user.teams || [];
  const team = teams.find((t: any) => t.team_key && t.league_key === leagueKey);
  return team ? String(team.team_key) : null;
}

export async function isLeaguePostDraft(yf: any, leagueKey: string): Promise<boolean> {
  const meta = await yf.league.meta(leagueKey);
  const draftStatus = (meta?.draft_status || meta?.league?.draft_status || '').toLowerCase();
  return draftStatus === 'postdraft';
}

export async function stageActions(leagueId: string, actions: any[]) {
  console.log('Stage actions called:', { leagueId, actions });
  return { staged: true };
}

export async function callYahoo(action: any) {
  console.log('Call Yahoo called with:', action);
  // Placeholder: The yahoo-fantasy library exposes read endpoints; write operations (add/drop, set lineup)
  // are not implemented here yet. This function remains a stub for future execution paths.
  return { success: false, reason: 'NOT_IMPLEMENTED' };
}

export async function yfForUser(userId: string) {
  console.log('Yahoo service called for userId:', userId);
  
  // Stub implementation - will be replaced with real Yahoo API integration in Phase 2
  return {
    getLeagues: async () => [],
    getTeams: async () => [],
    getRosters: async () => [],
    message: 'This is a stub Yahoo service. Will be implemented in Phase 2.'
  };
}

// Stub functions for future implementation
export async function stageActions(leagueId: string, actions: any[]) {
  console.log('Stage actions called:', { leagueId, actions });
  return { staged: true };
}

export async function callYahoo(action: any) {
  console.log('Call Yahoo called with:', action);
  return { success: true };
}
