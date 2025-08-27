import { Request, Response } from 'express';
import { z } from 'zod';
import { createYahooClient } from '../services/yahoo';

/**
 * Fetch team statistics for a league
 * GET /api/team/stats
 */
export async function getTeamStats(req: Request, res: Response) {
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
      
      // Use proper Yahoo game key format
      const gameKey = `nfl.l.${leagueId}`;
      const response = await yahooClient.get(`/league/${gameKey}/standings`);
      
      // Parse team standings data from Yahoo's nested structure
      const standings = response.data?.fantasy_content?.league?.[1]?.standings?.[0]?.teams || {};
      const teams: Array<{
        team_id: string;
        name: string;
        wins: number;
        losses: number;
        ties: number;
        points_for: number;
        points_against: number;
      }> = [];
      
      Object.values(standings).forEach((teamData: any) => {
        if (teamData?.team && Array.isArray(teamData.team[0])) {
          const teamArray = teamData.team[0];
          
          // Extract data from the complex nested array structure
          let teamId = null, teamName = null;
          let wins = 0, losses = 0, ties = 0, pointsFor = 0, pointsAgainst = 0;
          
          teamArray.forEach((item: any) => {
            if (item?.team_id) teamId = item.team_id;
            if (item?.name) teamName = item.name;
            if (item?.team_standings?.outcome_totals) {
              wins = parseInt(item.team_standings.outcome_totals.wins) || 0;
              losses = parseInt(item.team_standings.outcome_totals.losses) || 0;
              ties = parseInt(item.team_standings.outcome_totals.ties) || 0;
            }
            if (item?.team_standings?.points_for) {
              pointsFor = parseFloat(item.team_standings.points_for) || 0;
            }
            if (item?.team_standings?.points_against) {
              pointsAgainst = parseFloat(item.team_standings.points_against) || 0;
            }
          });
          
          if (teamId && teamName) {
            teams.push({
              team_id: teamId,
              name: teamName,
              wins,
              losses,
              ties,
              points_for: pointsFor,
              points_against: pointsAgainst
            });
          }
        }
      });

      console.log(`📊 Fetched stats for ${teams.length} teams in league: ${leagueId}`);
      
      res.json({
        success: true,
        teams: teams,
        league_id: leagueId
      });

    } catch (apiError: any) {
      console.error('Yahoo API error:', apiError.response?.data || apiError.message);
      res.status(500).json({
        error: 'Failed to fetch team stats from Yahoo API',
        message: apiError.response?.data?.error?.description || apiError.message
      });
    }

  } catch (error: any) {
    console.error('Team stats endpoint error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}