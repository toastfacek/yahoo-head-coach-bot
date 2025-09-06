import axios, { AxiosInstance } from 'axios';
import { yahooAuth } from './yahooAuth';
import { authLogger } from '../utils/logger';

interface YahooApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

interface LeagueInfo {
  id: string;
  name: string;
  season: string;
  sport: string;
  gameKey: string;
  leagueKey: string;
}

interface TeamInfo {
  teamKey: string;
  name: string;
  isOwned: boolean;
}

interface PlayerInfo {
  playerId: string;
  name: string;
  position: string;
  team: string;
  points?: number;
  owner?: string;
}

class YahooApiService {
  private cache = new Map<string, { data: any; expires: number }>();
  private readonly cacheTTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Create authenticated HTTP client for a user
   */
  private async createClient(discordUserId: string): Promise<AxiosInstance | null> {
    const accessToken = await yahooAuth.getValidAccessToken(discordUserId);
    if (!accessToken) {
      return null;
    }

    return axios.create({
      baseURL: 'https://fantasysports.yahooapis.com/fantasy/v2',
      timeout: 10000,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'User-Agent': 'Yahoo Fantasy HeadCoach Bot/1.0'
      },
      params: {
        format: 'json'
      }
    });
  }

  /**
   * Get cached data or fetch from API
   */
  private getCached<T>(key: string): T | null {
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now()) {
      return cached.data;
    }
    return null;
  }

  /**
   * Store data in cache
   */
  private setCached(key: string, data: any): void {
    this.cache.set(key, {
      data,
      expires: Date.now() + this.cacheTTL
    });
  }

  /**
   * Get current NFL game key
   */
  async getCurrentGameKey(discordUserId: string): Promise<YahooApiResponse<string>> {
    const cacheKey = `gameKey:${discordUserId}`;
    const cached = this.getCached<string>(cacheKey);
    if (cached) {
      return { success: true, data: cached };
    }

    try {
      const client = await this.createClient(discordUserId);
      if (!client) {
        return { success: false, error: 'Not authenticated with Yahoo' };
      }

      const response = await client.get('/game/nfl');
      const gameKey = response.data?.fantasy_content?.game?.[0]?.game_key;
      
      if (!gameKey) {
        return { success: false, error: 'Could not find current NFL game' };
      }

      this.setCached(cacheKey, gameKey);
      return { success: true, data: String(gameKey) };
      
    } catch (error: any) {
      authLogger.error({ error: error.message, discordUserId }, 'Failed to get game key');
      return { success: false, error: 'Failed to get current game information' };
    }
  }

  /**
   * Get user's leagues for current season
   */
  async getUserLeagues(discordUserId: string): Promise<YahooApiResponse<LeagueInfo[]>> {
    const cacheKey = `leagues:${discordUserId}`;
    const cached = this.getCached<LeagueInfo[]>(cacheKey);
    if (cached) {
      return { success: true, data: cached };
    }

    try {
      const gameKeyResult = await this.getCurrentGameKey(discordUserId);
      if (!gameKeyResult.success || !gameKeyResult.data) {
        return { success: false, error: gameKeyResult.error };
      }

      const client = await this.createClient(discordUserId);
      if (!client) {
        return { success: false, error: 'Not authenticated with Yahoo' };
      }

      const response = await client.get(`/users;use_login=1/games;game_keys=${gameKeyResult.data}/leagues`);
      
      // Parse Yahoo's complex response structure
      const leagues: LeagueInfo[] = [];
      const leaguesData = response.data?.fantasy_content?.users?.[0]?.user?.[1]?.games?.[0]?.game?.[1]?.leagues;
      
      if (leaguesData && typeof leaguesData === 'object') {
        for (const key in leaguesData) {
          const leagueEntry = leaguesData[key];
          if (leagueEntry?.league) {
            const league = Array.isArray(leagueEntry.league) ? leagueEntry.league[0] : leagueEntry.league;
            leagues.push({
              id: String(league.league_key?.split('.l.')[1] || league.league_id || ''),
              name: String(league.name || 'Unnamed League'),
              season: String(league.season || new Date().getFullYear()),
              sport: String(league.game_code || 'nfl'),
              gameKey: gameKeyResult.data,
              leagueKey: String(league.league_key || '')
            });
          }
        }
      }

      this.setCached(cacheKey, leagues);
      return { success: true, data: leagues };
      
    } catch (error: any) {
      authLogger.error({ error: error.message, discordUserId }, 'Failed to get user leagues');
      return { success: false, error: 'Failed to get your leagues' };
    }
  }

  /**
   * Get league standings
   */
  async getLeagueStandings(discordUserId: string, leagueKey: string): Promise<YahooApiResponse<any[]>> {
    const cacheKey = `standings:${discordUserId}:${leagueKey}`;
    const cached = this.getCached<any[]>(cacheKey);
    if (cached) {
      return { success: true, data: cached };
    }

    try {
      const client = await this.createClient(discordUserId);
      if (!client) {
        return { success: false, error: 'Not authenticated with Yahoo' };
      }

      const response = await client.get(`/league/${leagueKey}/standings`);
      
      // Parse standings from Yahoo's response
      const standings: any[] = [];
      const teamsData = response.data?.fantasy_content?.league?.[1]?.standings?.[0]?.teams;
      
      if (teamsData && typeof teamsData === 'object') {
        let place = 1;
        for (const key in teamsData) {
          const teamEntry = teamsData[key];
          if (teamEntry?.team) {
            const team = teamEntry.team[0]; // team[0] contains team info array
            const teamStats = teamEntry.team[1]; // team[1] contains team stats
            
            let teamName = 'Unknown Team';
            for (const item of team) {
              if (item?.name) {
                teamName = item.name;
                break;
              }
            }

            let record = '';
            if (teamStats?.team_standings?.outcome_totals) {
              const outcomes = teamStats.team_standings.outcome_totals;
              record = `${outcomes.wins}-${outcomes.losses}-${outcomes.ties}`;
            } else if (teamStats?.team_points) {
              record = `${teamStats.team_points.total} pts`;
            }

            standings.push({
              place: place++,
              name: teamName,
              record: record
            });
          }
        }
      }

      this.setCached(cacheKey, standings);
      return { success: true, data: standings };
      
    } catch (error: any) {
      authLogger.error({ error: error.message, discordUserId, leagueKey }, 'Failed to get league standings');
      return { success: false, error: 'Failed to get league standings' };
    }
  }

  /**
   * Get user's team in a league
   */
  async getUserTeam(discordUserId: string, leagueKey: string): Promise<YahooApiResponse<TeamInfo>> {
    const cacheKey = `userTeam:${discordUserId}:${leagueKey}`;
    const cached = this.getCached<TeamInfo>(cacheKey);
    if (cached) {
      return { success: true, data: cached };
    }

    try {
      const client = await this.createClient(discordUserId);
      if (!client) {
        return { success: false, error: 'Not authenticated with Yahoo' };
      }

      const response = await client.get(`/league/${leagueKey}/teams`);
      
      // Find user's team by checking ownership
      const teamsData = response.data?.fantasy_content?.league?.[1]?.teams;
      
      if (teamsData && typeof teamsData === 'object') {
        for (const key in teamsData) {
          const teamEntry = teamsData[key];
          if (teamEntry?.team) {
            const team = teamEntry.team[0]; // team[0] contains team data array
            
            // Look for ownership flag
            for (const item of team) {
              if (item?.is_owned_by_current_login === 1) {
                // Found user's team
                let teamName = 'My Team';
                let teamKey = '';
                
                for (const teamItem of team) {
                  if (teamItem?.name) teamName = teamItem.name;
                  if (teamItem?.team_key) teamKey = teamItem.team_key;
                }

                const userTeam: TeamInfo = {
                  teamKey,
                  name: teamName,
                  isOwned: true
                };

                this.setCached(cacheKey, userTeam);
                return { success: true, data: userTeam };
              }
            }
          }
        }
      }

      return { success: false, error: 'Could not find your team in this league' };
      
    } catch (error: any) {
      authLogger.error({ error: error.message, discordUserId, leagueKey }, 'Failed to get user team');
      return { success: false, error: 'Failed to find your team' };
    }
  }

  /**
   * Get team roster
   */
  async getTeamRoster(discordUserId: string, teamKey: string): Promise<YahooApiResponse<PlayerInfo[]>> {
    const cacheKey = `roster:${discordUserId}:${teamKey}`;
    const cached = this.getCached<PlayerInfo[]>(cacheKey);
    if (cached) {
      return { success: true, data: cached };
    }

    try {
      const client = await this.createClient(discordUserId);
      if (!client) {
        return { success: false, error: 'Not authenticated with Yahoo' };
      }

      const response = await client.get(`/team/${teamKey}/roster`);
      
      // Parse roster from Yahoo's complex structure
      const roster: PlayerInfo[] = [];
      const playersData = response.data?.fantasy_content?.team?.[1]?.roster?.[0]?.players;
      
      if (playersData && typeof playersData === 'object') {
        for (const key in playersData) {
          const playerEntry = playersData[key];
          if (playerEntry?.player) {
            const player = playerEntry.player[0]; // player[0] contains player info array
            const playerStats = playerEntry.player[1]; // player[1] contains selected position
            
            let playerId = '';
            let name = 'Unknown Player';
            let position = '';
            let team = '';
            
            for (const item of player) {
              if (item?.player_key) playerId = item.player_key;
              if (item?.name?.full) name = item.name.full;
              if (item?.primary_position) position = item.primary_position;
              if (item?.editorial_team_abbr) team = item.editorial_team_abbr;
            }

            const selectedPosition = playerStats?.selected_position?.[1]?.position || position;

            roster.push({
              playerId,
              name,
              position: selectedPosition,
              team
            });
          }
        }
      }

      this.setCached(cacheKey, roster);
      return { success: true, data: roster };
      
    } catch (error: any) {
      authLogger.error({ error: error.message, discordUserId, teamKey }, 'Failed to get team roster');
      return { success: false, error: 'Failed to get team roster' };
    }
  }

  /**
   * Search for players by name for autocomplete
   */
  async searchPlayers(discordUserId: string, searchTerm: string, leagueKey?: string): Promise<YahooApiResponse<PlayerInfo[]>> {
    if (!searchTerm || searchTerm.length < 2) {
      return { success: true, data: [] };
    }

    const cacheKey = `playerSearch:${discordUserId}:${searchTerm.toLowerCase()}:${leagueKey || 'all'}`;
    const cached = this.getCached<PlayerInfo[]>(cacheKey);
    if (cached) {
      return { success: true, data: cached };
    }

    try {
      const client = await this.createClient(discordUserId);
      if (!client) {
        return { success: false, error: 'Not authenticated with Yahoo' };
      }

      // If we have a specific league, search within that league
      let searchUrl = '';
      if (leagueKey) {
        searchUrl = `/league/${leagueKey}/players;search=${encodeURIComponent(searchTerm)}`;
      } else {
        // Search across all NFL players
        const gameKeyResult = await this.getCurrentGameKey(discordUserId);
        if (!gameKeyResult.success || !gameKeyResult.data) {
          return { success: false, error: 'Could not get current game information' };
        }
        searchUrl = `/game/${gameKeyResult.data}/players;search=${encodeURIComponent(searchTerm)}`;
      }

      const response = await client.get(searchUrl);
      
      // Parse players from Yahoo's response
      const players: PlayerInfo[] = [];
      const playersData = response.data?.fantasy_content?.game?.[1]?.players || 
                         response.data?.fantasy_content?.league?.[1]?.players;
      
      if (playersData && typeof playersData === 'object') {
        for (const key in playersData) {
          const playerEntry = playersData[key];
          if (playerEntry?.player) {
            const player = playerEntry.player[0]; // player[0] contains player info array
            
            let playerId = '';
            let name = 'Unknown Player';
            let position = '';
            let team = '';
            
            for (const item of player) {
              if (item?.player_key) playerId = item.player_key;
              if (item?.name?.full) name = item.name.full;
              if (item?.primary_position) position = item.primary_position;
              if (item?.editorial_team_abbr) team = item.editorial_team_abbr;
            }

            players.push({
              playerId,
              name,
              position,
              team
            });
          }
        }
      }

      // Limit results to top 10 for autocomplete performance
      const limitedResults = players.slice(0, 10);
      
      this.setCached(cacheKey, limitedResults);
      return { success: true, data: limitedResults };
      
    } catch (error: any) {
      authLogger.error({ error: error.message, discordUserId, searchTerm }, 'Failed to search players');
      return { success: false, error: 'Failed to search for players' };
    }
  }

  /**
   * Get detailed player information including stats
   */
  async getPlayerDetails(discordUserId: string, playerKey: string, leagueKey?: string, week?: number): Promise<YahooApiResponse<any>> {
    const cacheKey = `playerDetails:${discordUserId}:${playerKey}:${leagueKey || 'none'}:${week || 'season'}`;
    const cached = this.getCached<any>(cacheKey);
    if (cached) {
      return { success: true, data: cached };
    }

    try {
      const client = await this.createClient(discordUserId);
      if (!client) {
        return { success: false, error: 'Not authenticated with Yahoo' };
      }

      // Get basic player info
      let playerUrl = `/player/${playerKey}`;
      const playerResponse = await client.get(playerUrl);
      
      // Get player stats (season or week-specific)
      let statsUrl = '';
      if (week) {
        statsUrl = `/player/${playerKey}/stats;type=week;week=${week}`;
      } else {
        statsUrl = `/player/${playerKey}/stats`;
      }
      
      const statsResponse = await client.get(statsUrl);

      // Parse player data
      const playerData = playerResponse.data?.fantasy_content?.player?.[0];
      const statsData = statsResponse.data?.fantasy_content?.player?.[1]?.player_stats;

      if (!playerData) {
        return { success: false, error: 'Player not found' };
      }

      // Extract player information
      let playerInfo: any = {};
      for (const item of playerData) {
        if (item?.name) playerInfo.name = item.name;
        if (item?.uniform_number) playerInfo.uniformNumber = item.uniform_number;
        if (item?.primary_position) playerInfo.position = item.primary_position;
        if (item?.editorial_team_abbr) playerInfo.team = item.editorial_team_abbr;
        if (item?.image_url) playerInfo.imageUrl = item.image_url;
        if (item?.bye_weeks) playerInfo.byeWeeks = item.bye_weeks;
      }

      // Extract stats
      let stats: any = {};
      if (statsData?.stats) {
        for (const key in statsData.stats) {
          const statEntry = statsData.stats[key];
          if (statEntry?.stat) {
            const stat = statEntry.stat;
            if (stat?.stat_id && stat?.value) {
              stats[stat.stat_id] = stat.value;
            }
          }
        }
      }

      // Get player ownership if we have a league context
      let ownership = null;
      if (leagueKey) {
        try {
          const ownershipUrl = `/league/${leagueKey}/players;player_keys=${playerKey}/ownership`;
          const ownershipResponse = await client.get(ownershipUrl);
          const ownershipData = ownershipResponse.data?.fantasy_content?.league?.[1]?.players?.['0']?.player?.[1]?.ownership;
          
          if (ownershipData) {
            ownership = {
              type: ownershipData.ownership_type,
              teamName: ownershipData.owner_team_name || null
            };
          }
        } catch (ownershipError) {
          // Ownership lookup failed, but continue with other data
          authLogger.warn({ discordUserId, playerKey, leagueKey }, 'Failed to get player ownership');
        }
      }

      const playerDetails = {
        ...playerInfo,
        stats,
        ownership,
        week: week || null
      };

      this.setCached(cacheKey, playerDetails);
      return { success: true, data: playerDetails };
      
    } catch (error: any) {
      authLogger.error({ error: error.message, discordUserId, playerKey }, 'Failed to get player details');
      return { success: false, error: 'Failed to get player information' };
    }
  }

  /**
   * Get weekly matchups for a league
   */
  async getLeagueMatchups(discordUserId: string, leagueKey: string, week?: number): Promise<YahooApiResponse<any[]>> {
    const cacheKey = `matchups:${discordUserId}:${leagueKey}:${week || 'current'}`;
    const cached = this.getCached<any[]>(cacheKey);
    if (cached) {
      return { success: true, data: cached };
    }

    try {
      const client = await this.createClient(discordUserId);
      if (!client) {
        return { success: false, error: 'Not authenticated with Yahoo' };
      }

      // If no week specified, get current week
      let targetWeek = week;
      if (!targetWeek) {
        try {
          const leagueResponse = await client.get(`/league/${leagueKey}`);
          targetWeek = leagueResponse.data?.fantasy_content?.league?.[0]?.current_week;
        } catch (error) {
          authLogger.warn({ discordUserId, leagueKey }, 'Could not get current week, defaulting to 1');
          targetWeek = 1;
        }
      }

      const response = await client.get(`/league/${leagueKey}/scoreboard;week=${targetWeek}`);
      
      // Parse matchups from Yahoo's complex response
      const matchups: any[] = [];
      const scoreboardData = response.data?.fantasy_content?.league?.[1]?.scoreboard;
      const matchupsData = scoreboardData?.['0']?.matchups;
      
      if (matchupsData && typeof matchupsData === 'object') {
        for (const key in matchupsData) {
          const matchupEntry = matchupsData[key];
          if (matchupEntry?.matchup) {
            const matchupData = matchupEntry.matchup;
            
            // Extract teams data - Yahoo has a specific structure
            const teamsData = matchupData?.teams;
            if (teamsData) {
              let team1: any = null;
              let team2: any = null;
              
              // Teams are stored as numbered keys (0, 1)
              if (teamsData['0']?.team) {
                team1 = this.parseTeamMatchupData(teamsData['0'].team);
              }
              if (teamsData['1']?.team) {
                team2 = this.parseTeamMatchupData(teamsData['1'].team);
              }
              
              if (team1 && team2) {
                matchups.push({
                  week: targetWeek,
                  team1,
                  team2,
                  status: matchupData.status || 'upcoming'
                });
              }
            }
          }
        }
      }

      this.setCached(cacheKey, matchups);
      return { success: true, data: matchups };
      
    } catch (error: any) {
      authLogger.error({ error: error.message, discordUserId, leagueKey, week }, 'Failed to get league matchups');
      return { success: false, error: 'Failed to get matchups' };
    }
  }

  /**
   * Parse team data from Yahoo's matchup response
   */
  private parseTeamMatchupData(teamData: any): any {
    const team0 = teamData[0]; // Basic team info
    const team1 = teamData[1]; // Team stats and projections
    
    let teamInfo: any = {
      name: 'Unknown Team',
      points: 0,
      projectedPoints: 0
    };

    // Extract team name and basic info from team[0]
    for (const item of team0) {
      if (item?.name) {
        teamInfo.name = item.name;
      }
      if (item?.team_key) {
        teamInfo.teamKey = item.team_key;
      }
    }

    // Extract scoring and projection data from team[1]
    if (team1?.team_points) {
      teamInfo.points = parseFloat(team1.team_points.total || '0');
    }
    
    if (team1?.team_projected_points) {
      teamInfo.projectedPoints = parseFloat(team1.team_projected_points.total || '0');
    }

    // Win probability if available
    if (team1?.win_probability) {
      teamInfo.winProbability = parseFloat(team1.win_probability);
    }

    // Games tracking if available
    if (team1?.team_remaining_games) {
      const remaining = team1.team_remaining_games.total;
      teamInfo.gamesRemaining = parseInt(remaining.remaining_games || '0');
      teamInfo.gamesLive = parseInt(remaining.live_games || '0');
      teamInfo.gamesCompleted = parseInt(remaining.completed_games || '0');
    }

    return teamInfo;
  }

  /**
   * Get current week for a league
   */
  async getCurrentWeek(discordUserId: string, leagueKey: string): Promise<YahooApiResponse<number>> {
    const cacheKey = `currentWeek:${discordUserId}:${leagueKey}`;
    const cached = this.getCached<number>(cacheKey);
    if (cached) {
      return { success: true, data: cached };
    }

    try {
      const client = await this.createClient(discordUserId);
      if (!client) {
        return { success: false, error: 'Not authenticated with Yahoo' };
      }

      const response = await client.get(`/league/${leagueKey}`);
      const currentWeek = response.data?.fantasy_content?.league?.[0]?.current_week;
      
      if (currentWeek) {
        const week = parseInt(currentWeek);
        this.setCached(cacheKey, week);
        return { success: true, data: week };
      }
      
      return { success: false, error: 'Could not determine current week' };
      
    } catch (error: any) {
      authLogger.error({ error: error.message, discordUserId, leagueKey }, 'Failed to get current week');
      return { success: false, error: 'Failed to get current week' };
    }
  }

  /**
   * Clear cache for a user (useful after auth changes)
   */
  clearUserCache(discordUserId: string): void {
    for (const key of this.cache.keys()) {
      if (key.includes(discordUserId)) {
        this.cache.delete(key);
      }
    }
  }
}

// Export singleton instance
export const yahooApi = new YahooApiService();