import { Request, Response } from 'express';
import { z } from 'zod';
import { createYahooClient } from '../services/yahoo';

/**
 * Fetch user's fantasy football leagues
 * GET /api/leagues
 */
export async function getLeagues(req: Request, res: Response) {
  try {
    const Query = z.object({ userId: z.string().optional() });
    const parsed = Query.safeParse(req.query);
    
    if (!parsed.success) {
      return res.status(400).json({ 
        error: 'Invalid query parameters', 
        details: parsed.error.flatten() 
      });
    }

    const userId = parsed.data.userId || 'dev';
    
    try {
      const yahooClient = await createYahooClient(userId);
      
      // Fetch user's fantasy leagues from Yahoo API
      const response = await yahooClient.get('/users;use_login=1/games;game_keys=nfl/leagues');
      
      // Parse Yahoo's complex nested response format
      const leagues: Array<{id: string, league_id: string, name: string, season: string, game_code: string, is_finished: boolean}> = [];
      const gameData = response.data?.fantasy_content?.users?.[0]?.user?.[1]?.games;
      
      if (gameData) {
        Object.values(gameData).forEach((gameItem: any) => {
          if (gameItem?.game?.[1]?.leagues) {
            Object.values(gameItem.game[1].leagues).forEach((leagueItem: any) => {
              if (leagueItem?.league) {
                const league = leagueItem.league[0];
                leagues.push({
                  id: league.league_id, // Streamlit expects 'id' field
                  league_id: league.league_id,
                  name: league.name,
                  season: league.season,
                  game_code: league.game_code,
                  is_finished: league.is_finished === "1"
                });
              }
            });
          }
        });
      }

      console.log(`📊 Found ${leagues.length} leagues for user: ${userId}`);
      
      res.json({
        success: true,
        leagues: leagues,
        count: leagues.length
      });

    } catch (apiError: any) {
      console.error('Yahoo API error:', apiError.response?.data || apiError.message);
      res.status(500).json({
        error: 'Failed to fetch leagues from Yahoo API',
        message: apiError.response?.data?.error?.description || apiError.message
      });
    }

  } catch (error: any) {
    console.error('Leagues endpoint error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}