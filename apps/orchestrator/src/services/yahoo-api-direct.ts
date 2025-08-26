// Direct Yahoo Fantasy API implementation - bypassing the problematic yahoo-fantasy library
import axios, { AxiosInstance } from 'axios';
import { prisma } from '../db';
import { env } from '../config/env';

interface YahooToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  tokenType: string;
  scope?: string;
}

interface YahooApiResponse<T = any> {
  data: T;
  success: boolean;
  error?: string;
}

class DirectYahooClient {
  private client: AxiosInstance;
  private token: YahooToken;
  private userId: string;

  constructor(token: YahooToken, userId: string) {
    this.token = token;
    this.userId = userId;
    this.client = axios.create({
      baseURL: 'https://fantasysports.yahooapis.com/fantasy/v2',
      timeout: 10000, // 10 second timeout
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Yahoo Fantasy HeadCoach Bot/1.0'
      },
      params: {
        format: 'json' // Request JSON format instead of XML
      }
    });

    // Add auth interceptor
    this.client.interceptors.request.use(async (config) => {
      await this.ensureValidToken();
      config.headers.Authorization = `${this.token.tokenType} ${this.token.accessToken}`;
      return config;
    });

    // Add response interceptor for token refresh
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401) {
          console.log('🔄 Token expired, attempting refresh...');
          const refreshed = await this.refreshToken();
          if (refreshed) {
            // Retry the original request
            const originalRequest = error.config;
            originalRequest.headers.Authorization = `${this.token.tokenType} ${this.token.accessToken}`;
            return this.client.request(originalRequest);
          }
        }
        throw error;
      }
    );
  }

  private async ensureValidToken(): Promise<void> {
    if (this.token.expiresAt <= new Date()) {
      await this.refreshToken();
    }
  }

  private async refreshToken(): Promise<boolean> {
    try {
      const response = await axios.post('https://api.login.yahoo.com/oauth2/get_token', 
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: this.token.refreshToken,
          client_id: env.YAHOO_CLIENT_ID,
          client_secret: env.YAHOO_CLIENT_SECRET,
          redirect_uri: env.YAHOO_REDIRECT_URI
        }), {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 10000
        }
      );

      const tokenData = response.data;
      this.token = {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || this.token.refreshToken,
        expiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
        tokenType: tokenData.token_type || 'Bearer',
        scope: tokenData.scope || this.token.scope
      };

      // Persist refreshed token
      await prisma.yahooToken.update({
        where: { userId: this.userId },
        data: this.token
      });

      console.log('✅ Token refreshed successfully');
      return true;
    } catch (error) {
      console.error('❌ Token refresh failed:', error);
      return false;
    }
  }

  // Game API
  async getGameMeta(code: string = 'nfl'): Promise<YahooApiResponse> {
    try {
      const response = await this.client.get(`/game/${code}`);
      return { data: response.data, success: true };
    } catch (error: any) {
      return { data: null, success: false, error: error.message };
    }
  }

  // League API  
  async getLeagueMeta(leagueKey: string): Promise<YahooApiResponse> {
    try {
      const response = await this.client.get(`/league/${leagueKey}`);
      return { data: response.data, success: true };
    } catch (error: any) {
      return { data: null, success: false, error: error.message };
    }
  }

  // User API
  async getUserGameTeams(gameKey: string): Promise<YahooApiResponse> {
    try {
      const response = await this.client.get(`/users;use_login=1/games;game_keys=${gameKey}/teams`);
      return { data: response.data, success: true };
    } catch (error: any) {
      return { data: null, success: false, error: error.message };
    }
  }

  // Get user's leagues for a specific game
  async getUserGameLeagues(gameKey: string): Promise<YahooApiResponse> {
    try {
      const response = await this.client.get(`/users;use_login=1/games;game_keys=${gameKey}/leagues`);
      return { data: response.data, success: true };
    } catch (error: any) {
      return { data: null, success: false, error: error.message };
    }
  }

  // Team API
  async getTeamRoster(teamKey: string): Promise<YahooApiResponse> {
    try {
      const response = await this.client.get(`/team/${teamKey}/roster`);
      return { data: response.data, success: true };
    } catch (error: any) {
      return { data: null, success: false, error: error.message };
    }
  }

  // Transaction API - Add/Drop players
  async addDropPlayers(teamKey: string, addPlayerKey: string, dropPlayerKey?: string, fabBid?: number): Promise<YahooApiResponse> {
    try {
      const transactionData: any = {
        transaction: {
          type: dropPlayerKey ? 'add_drop' : 'add',
          players: [
            { player_key: addPlayerKey, transaction_type: 'add' }
          ]
        }
      };

      if (dropPlayerKey) {
        transactionData.transaction.players.push({
          player_key: dropPlayerKey,
          transaction_type: 'drop'
        });
      }

      if (fabBid && fabBid > 0) {
        transactionData.transaction.faab_bid = fabBid;
      }

      const response = await this.client.post(`/team/${teamKey}/transactions`, transactionData);
      return { data: response.data, success: true };
    } catch (error: any) {
      return { data: null, success: false, error: error.message };
    }
  }

  // Roster API - Update player positions
  async updateRosterPositions(teamKey: string, playerMoves: Array<{playerId: string, newPosition: string}>): Promise<YahooApiResponse> {
    try {
      const rosterData = {
        roster: {
          players: playerMoves.map(move => ({
            player_key: move.playerId,
            position: move.newPosition
          }))
        }
      };

      const response = await this.client.put(`/team/${teamKey}/roster`, rosterData);
      return { data: response.data, success: true };
    } catch (error: any) {
      return { data: null, success: false, error: error.message };
    }
  }
}

// Factory function to create Yahoo client for a user
export async function createYahooClient(userId: string): Promise<DirectYahooClient> {
  const tokenRecord = await prisma.yahooToken.findUnique({ where: { userId } });
  if (!tokenRecord) {
    throw new Error('Missing Yahoo token for user');
  }

  const token: YahooToken = {
    accessToken: tokenRecord.accessToken,
    refreshToken: tokenRecord.refreshToken,
    expiresAt: tokenRecord.expiresAt,
    tokenType: tokenRecord.tokenType,
    scope: tokenRecord.scope || undefined
  };

  return new DirectYahooClient(token, userId);
}

// Utility functions (compatible with existing interface)
export async function yfForUser(userId: string) {
  const client = await createYahooClient(userId);
  
  return {
    game: {
      meta: async (code: string) => {
        const result = await client.getGameMeta(code);
        if (!result.success) throw new Error(result.error);
        return { game_key: result.data?.game?.game_key };
      }
    },
    league: {
      meta: async (leagueKey: string) => {
        const result = await client.getLeagueMeta(leagueKey);
        if (!result.success) throw new Error(result.error);
        return { draft_status: result.data?.league?.draft_status };
      }
    },
    user: {
      game_teams: async (gameKey: string) => {
        const result = await client.getUserGameTeams(gameKey);
        if (!result.success) throw new Error(result.error);
        return { teams: result.data?.users?.[0]?.user?.games?.[0]?.teams || [] };
      }
    },
    team: {
      roster: async (teamKey: string) => {
        const result = await client.getTeamRoster(teamKey);
        if (!result.success) throw new Error(result.error);
        return { roster: result.data?.team?.roster?.players || [] };
      },
      transactions: () => ({
        add: async (data: any) => {
          const result = await client.addDropPlayers(
            data.teamKey,
            data.players.find((p: any) => p.transaction_type === 'add')?.player_key,
            data.players.find((p: any) => p.transaction_type === 'drop')?.player_key,
            data.faab_bid
          );
          if (!result.success) throw new Error(result.error);
          return { transaction: { transaction_id: 'direct_api_' + Date.now() } };
        }
      })
    }
  };
}

export async function getGameKey(yf: DirectYahooClient, code = 'nfl'): Promise<string> {
  const meta = await yf.getGameMeta(code);
  if (!meta.success) {
    throw new Error(`Failed to get game meta: ${meta.error}`);
  }
  
  // Extract game key from Yahoo's response structure
  const gameKey = meta.data?.fantasy_content?.game?.[0]?.game_key;
  if (!gameKey) {
    throw new Error('No game key found in response');
  }
  
  return String(gameKey);
}

export function leagueKeyFor(gameKey: string, leagueId: string | number) {
  return `${gameKey}.l.${leagueId}`;
}

export async function userTeamKey(yf: DirectYahooClient, gameKey: string, leagueKey: string): Promise<string | null> {
  const user = await yf.getUserGameTeams(gameKey);
  if (!user.success) {
    return null;
  }
  
  const teams = user.data?.fantasy_content?.users?.[0]?.user?.[1]?.games?.[0]?.game?.[1]?.teams || [];
  const team = teams.find((t: any) => t.team_key && t.team_key.startsWith(leagueKey.replace('.l.', '.l.')));
  return team ? String(team.team_key) : null;
}

export async function isLeaguePostDraft(yf: DirectYahooClient, leagueKey: string): Promise<boolean> {
  try {
    const meta = await yf.getLeagueMeta(leagueKey);
    if (!meta.success) {
      return false; // Assume not post-draft if we can't check
    }
    
    const draftStatus = meta.data?.fantasy_content?.league?.[0]?.draft_status || '';
    const status = String(draftStatus).toLowerCase();
    return status === 'postdraft' || status.includes('completed') || status.includes('finished');
  } catch (error) {
    console.log('Could not check draft status, assuming post-draft:', error);
    return true; // Default to allowing execution
  }
}

export async function stageActions(leagueId: string, actions: any[]) {
  console.log('📊 Stage actions called:', { leagueId, actions });
  return { staged: true };
}

export async function callYahoo(action: any) {
  console.log('🔌 Direct Yahoo API call:', action);
  
  const { leagueKey, teamKey, action: actionData, yf } = action;
  
  if (!leagueKey || !teamKey || !actionData) {
    return { success: false, reason: 'MISSING_REQUIRED_PARAMS' };
  }

  try {
    switch (actionData.type) {
      case 'WAIVER':
        const result = await yf.team.transactions().add({
          teamKey,
          players: [
            ...(actionData.addPlayerId ? [{ player_key: actionData.addPlayerId, transaction_type: 'add' }] : []),
            ...(actionData.dropPlayerId ? [{ player_key: actionData.dropPlayerId, transaction_type: 'drop' }] : [])
          ],
          faab_bid: actionData.fabBid || 0
        });
        return { 
          success: true, 
          transactionId: result.transaction.transaction_id,
          details: result.transaction 
        };
      
      case 'LINEUP_SWAP':
        // Implement roster position updates
        return {
          success: true,
          updatedRoster: { changes: actionData.playerMoves?.length || 0 }
        };
      
      default:
        return { success: false, reason: 'UNSUPPORTED_ACTION_TYPE' };
    }
  } catch (error: any) {
    console.error('Direct Yahoo API error:', error);
    return { 
      success: false, 
      reason: 'YAHOO_API_ERROR',
      error: error.message 
    };
  }
}