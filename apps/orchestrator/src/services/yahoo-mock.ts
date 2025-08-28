// Mock Yahoo service to test server startup without yahoo-fantasy library
import { env } from '../config/env';
import { prisma } from '../db';

// Mock Yahoo client that doesn't import the problematic yahoo-fantasy library
class MockYahooClient {
  constructor(_clientId: string, _clientSecret: string, _onRefresh: any, _redirectUri: string) {
    console.log('🔧 MockYahooClient created (yahoo-fantasy library bypassed)');
  }

  setUserToken(_token: string) {
    console.log('🔧 Mock: setUserToken called');
  }

  setRefreshToken(_token: string) {
    console.log('🔧 Mock: setRefreshToken called');
  }

  game = {
    meta: async (_code: string) => {
      console.log('🔧 Mock: game.meta called');
      return { game_key: '431' };
    },
  };

  league = {
    meta: async (_leagueKey: string) => {
      console.log('🔧 Mock: league.meta called');
      return { draft_status: 'postdraft' };
    },
  };

  user = {
    game_teams: async (_gameKey: string) => {
      console.log('🔧 Mock: user.game_teams called');
      return {
        teams: [
          {
            team_key: '431.l.123456.t.1',
            team_id: '1',
            league_key: '431.l.123456',
            name: 'Mock Team',
          },
        ],
      };
    },
  };

  team = {
    roster: async (_teamKey: string) => {
      console.log('🔧 Mock: team.roster called');
      return {
        roster: [
          {
            player_id: '12345',
            player_key: 'nfl.p.12345',
            name: { full: 'Mock Player' },
            eligible_positions: ['QB'],
            selected_position: 'QB',
            status: 'HEALTHY',
          },
        ],
      };
    },
    transactions: (_teamKey: string) => ({
      add: async (_data: any) => {
        console.log('🔧 Mock: transactions.add called');
        return {
          transaction: {
            transaction_id: 'mock_trans_123',
            type: 'add_drop',
            status: 'successful',
          },
        };
      },
    }),
  };
}

// Build a mock Yahoo client for testing
export async function yfForUser(userId: string) {
  const tok = await prisma.yahooToken.findUnique({ where: { userId } });
  if (!tok) throw new Error('Missing Yahoo token for user');

  const onRefresh = async (_tokenData: any) => {
    console.log('🔧 Mock: onRefresh called');
    // Mock token refresh without actual persistence for testing
  };

  const mockClient = new MockYahooClient(
    env.YAHOO_CLIENT_ID,
    env.YAHOO_CLIENT_SECRET,
    onRefresh,
    env.YAHOO_REDIRECT_URI
  );

  return mockClient as any;
}

// Resolve numeric → game_key (e.g., nfl)
export async function getGameKey(yf: any, code = 'nfl'): Promise<string> {
  const meta = await yf.game.meta(code);
  return String(meta.game_key);
}

// Compose Yahoo league key from game + league id
export function leagueKeyFor(gameKey: string, leagueId: string | number) {
  return `${gameKey}.l.${leagueId}`;
}

// Find the authenticated user's team in this league
export async function userTeamKey(
  yf: any,
  gameKey: string,
  leagueKey: string
): Promise<string | null> {
  const user = await yf.user.game_teams(gameKey);
  const teams = user.teams || [];
  const team = teams.find((t: any) => t.team_key && t.league_key === leagueKey);
  return team ? String(team.team_key) : null;
}

// Check whether league has completed its draft
export async function isLeaguePostDraft(yf: any, leagueKey: string): Promise<boolean> {
  const meta = await yf.league.meta(leagueKey);
  const draftStatus = (meta?.draft_status || meta?.league?.draft_status || '').toLowerCase();
  return draftStatus === 'postdraft';
}

export async function stageActions(leagueId: string, actions: any[]) {
  console.log('🔧 Mock: Stage actions called:', { leagueId, actions });
  return { staged: true };
}

export async function callYahoo(action: any) {
  console.log('🔧 Mock: callYahoo called with:', action);

  const { leagueKey, teamKey, action: actionData } = action;

  if (!leagueKey || !teamKey || !actionData) {
    return { success: false, reason: 'MISSING_REQUIRED_PARAMS' };
  }

  // Mock successful execution for testing
  switch (actionData.type) {
    case 'WAIVER':
      return {
        success: true,
        transactionId: 'mock_waiver_123',
        details: { type: 'waiver', mock: true },
      };

    case 'LINEUP_SWAP':
      return {
        success: true,
        updatedRoster: { mock: true, changes: actionData.playerMoves?.length || 0 },
      };

    default:
      return { success: false, reason: 'UNSUPPORTED_ACTION_TYPE' };
  }
}
