// Scout tool: gather roster + injury signals + social intelligence for the user's team
// Enhanced with Rube MCP integration for social sentiment and news analysis
// Notes:
// - Read-only Yahoo calls using bearer auth from stored tokens
// - Integrates social intelligence via ExternalDataService
// - Produces enriched payload with context for analyst tool
import { externalDataService } from '../services/externalData';
import {
  yfForUser,
  getGameKey,
  leagueKeyFor,
  userTeamKey,
  isLeaguePostDraft,
} from '../services/yahoo';

// Enhanced player data with social intelligence
type ScoutPlayer = {
  player_id: string | number;
  name: string;
  status?: string;
  selected_position?: string;
  eligible_positions?: string[];
  // Social intelligence from Rube MCP integration
  social_sentiment?: string;
  recent_news?: string[];
  reddit_mentions?: number;
};

export async function scout({
  leagueId,
  userId = 'dev',
  includeSocialIntel = true,
}: {
  leagueId: string;
  userId?: string;
  includeSocialIntel?: boolean;
}) {
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
    const baseRoster: ScoutPlayer[] = (team?.roster || []).map((p: any) => ({
      player_id: p.player_id || p.player_key || p.playerId,
      name: p.name?.full || p.name || '',
      status: p.status,
      selected_position: p.selected_position,
      eligible_positions: p.eligible_positions || [],
    }));

    // 4) Enhanced: Gather social intelligence for roster players
    let roster = baseRoster;
    let socialIntelligence = null;
    let weatherContext = null;

    if (includeSocialIntel) {
      try {
        console.log('Gathering social intelligence for roster players...');

        // Get player names for social analysis (focus on key positions)
        const keyPlayers = baseRoster
          .filter((p) => p.selected_position && p.selected_position !== 'BN')
          .slice(0, 8) // Limit to avoid too many API calls
          .map((p) => p.name);

        // Parallel data gathering via ExternalDataService
        const [redditSentiment, fantasyNews, weatherData] = await Promise.all([
          externalDataService.getRedditSentiment(keyPlayers),
          externalDataService.getFantasyNews({
            players: keyPlayers,
            limit: 10,
            hours_back: 24,
          }),
          externalDataService.getWeatherData({
            outdoor_only: true,
            week: getCurrentNFLWeek(),
          }),
        ]);

        // Enhance roster with social intelligence
        roster = baseRoster.map((player) => {
          const sentiment = redditSentiment.find((s) => s.player === player.name);
          const playerNews = fantasyNews.filter(
            (news) =>
              news.player_ids.some((id) => id === String(player.player_id)) ||
              news.title.toLowerCase().includes(player.name.toLowerCase())
          );

          return {
            ...player,
            social_sentiment: sentiment?.sentiment || 'neutral',
            recent_news: playerNews.map((n) => n.title),
            reddit_mentions: sentiment?.posts?.length || 0,
          };
        });

        socialIntelligence = {
          reddit_sentiment: redditSentiment,
          recent_news: fantasyNews,
          news_summary: `Found ${fantasyNews.length} recent news items affecting roster players`,
        };

        weatherContext = {
          conditions: weatherData,
          summary: `Weather data for ${weatherData.length} outdoor games this week`,
        };

        console.log(
          `Social intelligence gathered: ${redditSentiment.length} Reddit analyses, ${fantasyNews.length} news items`
        );
      } catch (socialError) {
        console.warn('Social intelligence gathering failed:', socialError);
        // Continue with base roster if social intel fails
        socialIntelligence = { error: 'Social intelligence unavailable' };
      }
    }

    // 5) Derive injury buckets for downstream rules (enhanced with social context)
    const injuries = {
      out: roster.filter((p) => /^(O|OUT)$/i.test(p.status || '')),
      doubtful: roster.filter((p) => /^(D|Doubtful)$/i.test(p.status || '')),
      questionable: roster.filter((p) => /^(Q|Questionable)$/i.test(p.status || '')),
      ir: roster.filter((p) => /IR|PUP|NFI|SUSP/i.test(p.status || '')),
      // Enhanced: Players with negative social sentiment (potential concerns)
      social_concerns: roster.filter((p) => p.social_sentiment === 'negative'),
      // Enhanced: Players with recent news (need monitoring)
      news_worthy: roster.filter((p) => p.recent_news && p.recent_news.length > 0),
    };

    // Enhanced payload with social intelligence for analyst consumption
    return {
      leagueKey,
      teamKey,
      postDraft,
      roster,
      injuries,
      // Enhanced: Social intelligence context
      socialIntelligence,
      weatherContext,
      // Enhanced: Key insights summary
      insights: {
        total_players: roster.length,
        injury_concerns:
          injuries.out.length + injuries.doubtful.length + injuries.questionable.length,
        social_concerns: injuries.social_concerns.length,
        news_alerts: injuries.news_worthy.length,
        intel_enabled: includeSocialIntel,
      },
      asOf: new Date().toISOString(),
    };
  } catch (err: any) {
    console.error('Enhanced scout error:', err);
    return {
      message: err?.message || 'Enhanced scout failed',
      fallback: true,
      error: err.name || 'Unknown',
    };
  }
}

/**
 * Helper function to get current NFL week
 */
function getCurrentNFLWeek(): number {
  // Simplified NFL week calculation - would use actual NFL calendar in production
  const now = new Date();
  const nflStart = new Date(now.getFullYear(), 8, 5); // Approximate NFL season start (Sept 5)
  const weeksDiff = Math.floor((now.getTime() - nflStart.getTime()) / (7 * 24 * 60 * 60 * 1000));
  return Math.max(1, Math.min(18, weeksDiff + 1));
}
