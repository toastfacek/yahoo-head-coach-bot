// Enhanced Analyst tool: leverages social intelligence and web search for superior analysis
// Strategy:
// - Use enhanced scout data with social intelligence for context
// - Integrate real-time web search for breaking news and beat reporter insights
// - Delegate complex multi-factor decisions to AnalystAgent with enriched data
// - Combine heuristic, social, and AI analysis for comprehensive recommendations
import { yfForUser, getGameKey, leagueKeyFor, userTeamKey } from '../services/yahoo';
import { AnalystAgent } from '../agents/analyst';
import { externalDataService } from '../services/externalData';

type AnalystInput = { leagueId: string; userId?: string; window?: string; scout?: any };

// Map common flex slots to eligible base positions
const FLEX_MAP: Record<string, string[]> = {
  'W/R/T': ['WR', 'RB', 'TE'],
  'WR/RB': ['WR', 'RB'],
  'Q/W/R/T': ['QB', 'WR', 'RB', 'TE'],
  'FLEX': ['WR', 'RB', 'TE'],
};

// Can a player with eligible positions fill a lineup slot (including flex rules)?
function canFill(slot: string, eligible: string[]): boolean {
  if (!slot) return false;
  if (eligible.includes(slot)) return true;
  const flex = FLEX_MAP[slot];
  return Array.isArray(flex) && flex.some((p) => eligible.includes(p));
}

export async function analyze(input: AnalystInput) {
  const { leagueId, userId = 'dev' } = input;

  // Prefer scout-fed roster to avoid re-fetch
  let roster: any[] | null = input.scout?.roster ?? null;

  if (!roster) {
    try {
      const yf = await yfForUser(userId);
      const gameKey = await getGameKey(yf, 'nfl');
      const leagueKey = leagueKeyFor(gameKey, leagueId);
      const teamKey = await userTeamKey(yf, gameKey, leagueKey);
      if (teamKey) {
        const team = await (yf as any).team.roster(teamKey);
        roster = team?.roster || null;
      }
    } catch (e) {
      // ignore — will fall back to empty
    }
  }

  roster = Array.isArray(roster) ? roster : [];

  // Check for complex decision factors that require AI analysis
  const requiresAIAnalysis = await shouldUseAIAnalysis(roster, input);

  if (requiresAIAnalysis) {
    return await performAIAnalysis(roster, input, leagueId, userId);
  }

  // Fall back to heuristic analysis for simple cases
  return await performHeuristicAnalysis(roster, input);
}

// Determine if situation requires sophisticated AI analysis
async function shouldUseAIAnalysis(roster: any[], input: AnalystInput): Promise<boolean> {
  // Use AI analysis if:
  // 1. Multiple players have questionable/doubtful status
  const injuredPlayers = roster.filter(p => /^(Q|D|O)$/i.test(p.status || ''));
  if (injuredPlayers.length >= 3) return true;

  // 2. Complex positional decisions (multiple FLEX candidates)
  const flexEligible = roster.filter(p => 
    Array.isArray(p.eligible_positions) && 
    p.eligible_positions.some((pos: string) => ['WR', 'RB', 'TE'].includes(pos))
  );
  if (flexEligible.length >= 6) return true;

  // 3. Close confidence thresholds requiring nuanced analysis
  const marginalDecisions = roster.filter(p => {
    const status = p.status || '';
    return /^(Q|Questionable)$/i.test(status);
  });
  if (marginalDecisions.length >= 2) return true;

  // 4. External data available (weather, news, etc.) that could impact decisions
  if (input.window === 'advanced' || input.scout?.injuries?.questionable?.length >= 2) {
    return true;
  }

  // 5. Enhanced: Social intelligence indicates concerns or news alerts
  if (input.scout?.insights?.social_concerns > 0 || input.scout?.insights?.news_alerts > 2) {
    return true;
  }

  // 6. Enhanced: Weather conditions may significantly impact outdoor games
  if (input.scout?.weatherContext?.conditions?.some((w: any) => w.field_conditions === 'poor')) {
    return true;
  }

  return false;
}

// Enhanced AI-powered analysis using AnalystAgent with web search integration
async function performAIAnalysis(roster: any[], input: AnalystInput, leagueId: string, userId: string) {
  try {
    const analystAgent = new AnalystAgent();
    
    // Enhanced: Gather additional real-time intelligence via web search
    const playerIds = roster.map(p => p.player_id || p.player_key).filter(Boolean);
    const playerNames = roster.map(p => p.name).filter(Boolean);
    
    // Parallel data gathering: existing analysis data + real-time web search
    const [externalData, beatReporterIntel] = await Promise.all([
      externalDataService.getPlayerAnalysisData(playerIds),
      gatherBeatReporterIntel(playerNames)
    ]);
    
    const week = getCurrentWeek(); // Helper function to get current NFL week

    // Enhanced: Perform comprehensive analysis with social + beat reporter intelligence
    const aiAnalysis = await analystAgent.performWeeklyAnalysis({
      roster,
      availablePlayers: [], // Would need waiver wire data for full analysis
      rosterNeeds: ['WR', 'RB'], // Could be derived from roster analysis
      fabBudget: 100, // Would come from league settings
      // Enhanced data sources
      weather: [
        ...(externalData.players.map(p => p.weather).filter(Boolean)),
        ...(input.scout?.weatherContext?.conditions || [])
      ],
      news: [
        ...(externalData.players.flatMap(p => p.news)),
        ...(beatReporterIntel.breaking_news.map(n => ({
          title: n.headline,
          source: n.source,
          impact_level: n.urgency,
          player_ids: [n.player]
        })))
      ],
      // Social intelligence from enhanced scout
      socialSentiment: input.scout?.socialIntelligence,
      beatReporterIntel,
      week
    });

    // Enhanced: Convert AI analysis to tool format with beat reporter context
    return {
      analysis: `${aiAnalysis.summary} Enhanced with ${beatReporterIntel.breaking_news.length} breaking news items and social intelligence.`,
      recommendations: aiAnalysis.lineup_recommendations.map(rec => ({
        id: rec.player_id,
        type: 'LINEUP_SWAP',
        summary: `${rec.action.toUpperCase()}: ${rec.player_name} (${rec.confidence}% confidence)`,
        confidence: rec.confidence / 100, // Convert to 0-1 scale
        reason: rec.reasoning.includes('injury') ? 'INJURY_RISK' : 
                rec.reasoning.includes('news') ? 'BREAKING_NEWS' :
                rec.reasoning.includes('social') ? 'SOCIAL_SENTIMENT' : 'MATCHUP_ADVANTAGE',
        swap: {
          playerName: rec.player_name,
          action: rec.action,
          slot: rec.position_slot,
          reasoning: rec.reasoning
        }
      })),
      insights: [
        ...aiAnalysis.key_insights,
        // Enhanced insights from beat reporter intel
        ...beatReporterIntel.breaking_news.filter(n => n.urgency === 'high').map(n => 
          `Breaking: ${n.headline} (${n.source})`
        ),
        ...beatReporterIntel.practice_reports.map(r => 
          `Practice: ${r.player} - ${r.status}`
        )
      ],
      riskAlerts: [
        ...aiAnalysis.risk_alerts,
        // Enhanced risk alerts from social intelligence
        ...(input.scout?.injuries?.social_concerns || []).map((p: any) => 
          `Social concern: ${p.name} showing negative sentiment`
        )
      ],
      beatReporterIntel,
      aiPowered: true
    };
  } catch (error) {
    console.error('AI analysis failed, falling back to heuristics:', error);
    return await performHeuristicAnalysis(roster, input);
  }
}

// Original heuristic-based analysis for simple cases
async function performHeuristicAnalysis(roster: any[], input: AnalystInput) {
  // Partition starters vs bench (Yahoo marks bench as BN)
  const starters = roster.filter((p: any) => p.selected_position && p.selected_position !== 'BN');
  const bench = roster.filter((p: any) => !p.selected_position || p.selected_position === 'BN');

  const actions: any[] = [];

  // Basic injury flags used for heuristics
  const isOut = (s?: string) => /^(O|OUT|IR|PUP|NFI|SUSP)$/i.test(s || '');
  const isDoubtful = (s?: string) => /^(D|Doubtful)$/i.test(s || '');
  const isQuestionable = (s?: string) => /^(Q|Questionable)$/i.test(s || '');

  for (const sp of starters) {
    const slot = sp.selected_position as string;
    const status = sp.status || '';
    const benchCandidates = bench.filter(
      (bp: any) => Array.isArray(bp.eligible_positions) && canFill(slot, bp.eligible_positions)
    );

    // OUT -> strong swap recommendation
    if (isOut(status) && benchCandidates.length > 0) {
      const bp = benchCandidates[0];
      actions.push({
        id: `${sp.player_id}->${bp.player_id}`,
        type: 'LINEUP_SWAP',
        summary: `Start ${bp.name} in ${slot} over ${sp.name} (OUT)`,
        confidence: 0.9,
        reason: 'INJURY_OUT',
        swap: { out: sp, in: bp, slot },
      });
      continue;
    }

    // Doubtful -> medium-high recommendation
    if (isDoubtful(status) && benchCandidates.length > 0) {
      const bp = benchCandidates[0];
      actions.push({
        id: `${sp.player_id}->${bp.player_id}`,
        type: 'LINEUP_SWAP',
        summary: `Consider ${bp.name} in ${slot} over ${sp.name} (Doubtful)`,
        confidence: 0.82,
        reason: 'INJURY_RISK',
        swap: { out: sp, in: bp, slot },
      });
      continue;
    }

    // Questionable -> soft recommendation (monitor)
    if (isQuestionable(status) && benchCandidates.length > 0) {
      const bp = benchCandidates[0];
      actions.push({
        id: `${sp.player_id}->${bp.player_id}`,
        type: 'LINEUP_SWAP',
        summary: `Monitor: ${bp.name} in ${slot} over ${sp.name} (Questionable)`,
        confidence: 0.7,
        reason: 'INJURY_RISK',
        swap: { out: sp, in: bp, slot },
      });
      continue;
    }
  }

  // Return a human-readable analysis + normalized recommendations array
  return {
    analysis: `Heuristic analysis: Evaluated ${starters.length} starters against ${bench.length} bench candidates. Found ${actions.length} lineup swaps based on injury designations.`,
    recommendations: actions,
    aiPowered: false
  };
}

/**
 * Enhanced beat reporter intelligence gathering via web search
 * Searches for breaking news, practice reports, and insider information
 */
async function gatherBeatReporterIntel(playerNames: string[]): Promise<{
  breaking_news: Array<{player: string; headline: string; source: string; urgency: 'low' | 'medium' | 'high'}>;
  practice_reports: Array<{player: string; status: string; details: string}>;
  insider_notes: Array<{player: string; note: string; reliability: number}>;
}> {
  console.log('Gathering beat reporter intelligence for:', playerNames.slice(0, 3).join(', '));
  
  try {
    // Focus on top players to avoid too many API calls
    const keyPlayers = playerNames.slice(0, 5);
    
    // Use external data service to perform web searches for beat reporter news
    const newsPromises = keyPlayers.map(async (player) => {
      try {
        const newsItems = await externalDataService.getFantasyNews({
          players: [player],
          limit: 3,
          hours_back: 12 // Very recent news only
        });
        
        return {
          player,
          news: newsItems,
          searched: true
        };
      } catch (error) {
        console.warn(`Beat reporter search failed for ${player}:`, error);
        return { player, news: [], searched: false };
      }
    });
    
    const playerNewsResults = await Promise.all(newsPromises);
    
    // Transform web search results into structured beat reporter intelligence
    const breakingNews = playerNewsResults.flatMap(result => 
      result.news.map(news => ({
        player: result.player,
        headline: news.title,
        source: news.source,
        urgency: news.impact_level === 'critical' ? 'high' : 
                 news.impact_level === 'high' ? 'medium' : 'low'
      }))
    );
    
    const practiceReports = breakingNews
      .filter(news => news.headline.toLowerCase().includes('practice'))
      .map(news => ({
        player: news.player,
        status: news.headline.includes('limited') ? 'LIMITED' : 
                news.headline.includes('full') ? 'FULL' : 'MONITORING',
        details: news.headline
      }));
    
    const insiderNotes = breakingNews
      .filter(news => news.source.toLowerCase().includes('insider') || news.urgency === 'high')
      .map(news => ({
        player: news.player,
        note: news.headline,
        reliability: news.urgency === 'high' ? 90 : 75
      }));
    
    console.log(`Beat reporter intel gathered: ${breakingNews.length} breaking news, ${practiceReports.length} practice reports, ${insiderNotes.length} insider notes`);
    
    return {
      breaking_news: breakingNews,
      practice_reports: practiceReports,
      insider_notes: insiderNotes
    };
  } catch (error) {
    console.error('Beat reporter intelligence gathering failed:', error);
    return {
      breaking_news: [],
      practice_reports: [],
      insider_notes: []
    };
  }
}

// Helper function to get current NFL week (would be more sophisticated in production)
function getCurrentWeek(): number {
  // Simplified - would use actual NFL calendar
  const now = new Date();
  const nflStart = new Date(now.getFullYear(), 8, 1); // Approximate NFL season start
  const weeksDiff = Math.floor((now.getTime() - nflStart.getTime()) / (7 * 24 * 60 * 60 * 1000));
  return Math.max(1, Math.min(18, weeksDiff + 1));
}
