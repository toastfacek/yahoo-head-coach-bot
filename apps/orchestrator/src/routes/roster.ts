import { Request, Response } from 'express';
import { z } from 'zod';
import { createYahooClient } from '../services/yahoo';

interface Player {
  player_id: string;
  name: string;
  position: string;
  team: string;
  selected_position: string;
  status: string;
  points: number;
}

/**
 * Fetch user's roster/players for a league
 * GET /api/team/roster
 */
export async function getTeamRoster(req: Request, res: Response) {
  try {
    const Query = z.object({ 
      userId: z.string().optional(),
      leagueId: z.string()
    });
    const parsed = Query.safeParse(req.query);
    
    if (!parsed.success) {
      return res.status(400).json({ 
        error: 'Invalid query parameters', 
        details: parsed.error.flatten() 
      });
    }

    const { userId = 'dev', leagueId } = parsed.data;
    
    try {
      const yahooClient = await createYahooClient(userId);
      const gameKey = `nfl.l.${leagueId}`;
      
      // First, get user's team ID
      const teamsResponse = await yahooClient.get(`/league/${gameKey}/teams`);
      const teamsData = teamsResponse.data?.fantasy_content?.league?.[1]?.teams || {};
      
      let userTeamId = null;
      const foundTeams: Array<{id: string, name: string, owned: number | null}> = [];
      
      Object.values(teamsData).forEach((teamData: any) => {
        if (teamData?.team && Array.isArray(teamData.team[0])) {
          const teamArray = teamData.team[0];
          
          let teamId = null, teamName = null, isOwned = null;
          teamArray.forEach((item: any) => {
            if (item?.team_id) teamId = item.team_id;
            if (item?.name) teamName = item.name;
            if (item?.is_owned_by_current_login) isOwned = item.is_owned_by_current_login;
          });
          
          if (teamId && teamName) {
            foundTeams.push({ id: teamId, name: teamName, owned: isOwned });
            if (isOwned === 1) { // Note: it's a number, not string
              userTeamId = teamId;
            }
          }
        }
      });

      if (!userTeamId && foundTeams.length > 0) {
        // Fallback to first team if ownership detection fails
        userTeamId = foundTeams[0].id;
        console.log('Using fallback team:', userTeamId);
      }

      if (!userTeamId) {
        return res.status(404).json({ 
          error: 'Could not find user team',
          debug: { foundTeams, teamsCount: foundTeams.length }
        });
      }

      // Fetch roster for user's team
      const rosterResponse = await yahooClient.get(`/team/${gameKey}.t.${userTeamId}/roster`);
      
      // Parse roster data from Yahoo's complex nested structure
      const playersData = rosterResponse.data?.fantasy_content?.team?.[1]?.roster?.[0]?.players || {};
      const players: Player[] = [];
      
      Object.values(playersData).forEach((playerData: any) => {
        if (playerData?.player && Array.isArray(playerData.player)) {
          const playerArray = playerData.player;
          const basicInfoArray = playerArray[0]; // Array of player info objects
          const positionInfo = playerArray[1]; // Position info object
          
          let playerId = null, playerName = null, position = null, team = null, selectedPosition = null;
          
          // Extract from basic info array (each element is an object with one key-value pair)
          if (Array.isArray(basicInfoArray)) {
            basicInfoArray.forEach((item: any) => {
              if (item?.player_id) playerId = item.player_id;
              if (item?.name?.full) playerName = item.name.full;
              if (item?.primary_position) position = item.primary_position;
              if (item?.editorial_team_abbr) team = item.editorial_team_abbr;
            });
          }
          
          // Extract selected position from the nested structure
          if (positionInfo?.selected_position && Array.isArray(positionInfo.selected_position)) {
            const posArray = positionInfo.selected_position;
            posArray.forEach((item: any) => {
              if (item?.position) selectedPosition = item.position;
            });
          }
          
          if (playerId && playerName) {
            players.push({
              player_id: playerId,
              name: playerName,
              position: position || 'Unknown',
              team: team || 'FA',
              selected_position: selectedPosition || 'BN',
              status: 'Healthy',
              points: 0 // TODO: Fetch actual points from player stats API
            });
          }
        }
      });

      console.log(`👥 Fetched roster: ${players.length} players for team ${userTeamId}`);
      
      res.json({
        success: true,
        players: players,
        starters: players.filter(p => p.selected_position !== 'BN'), // Non-bench players
        team_id: userTeamId,
        league_id: leagueId
      });

    } catch (apiError: any) {
      console.error('Yahoo API error:', apiError.response?.data || apiError.message);
      res.status(500).json({
        error: 'Failed to fetch roster from Yahoo API',
        message: apiError.response?.data?.error?.description || apiError.message
      });
    }

  } catch (error: any) {
    console.error('Roster endpoint error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}