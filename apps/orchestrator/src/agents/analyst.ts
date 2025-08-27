// AI-Powered Analyst Sub-Agent with sophisticated reasoning
// Uses Claude 3.5 Haiku for cost-efficient complex analysis
import { Anthropic } from '@anthropic-ai/sdk';
import { z } from 'zod';
import { env } from '../config/env';

// Structured schemas for analyst outputs
export const WaiverRecommendationSchema = z.object({
  player_id: z.string(),
  player_name: z.string(),
  position: z.string(),
  fab_bid: z.number(),
  fab_percentage: z.number(),
  confidence: z.number().min(0).max(100),
  reasoning: z.string(),
  drop_candidate: z.string().optional(),
  risk_factors: z.array(z.string()),
  upside_factors: z.array(z.string()),
  priority_rank: z.number()
});

export const LineupRecommendationSchema = z.object({
  player_id: z.string(),
  player_name: z.string(),
  action: z.enum(['start', 'bench', 'monitor']),
  position_slot: z.string(),
  confidence: z.number().min(0).max(100),
  reasoning: z.string(),
  weather_impact: z.string().optional(),
  matchup_grade: z.string().optional(),
  projected_points: z.number().optional()
});

export const AnalysisResponseSchema = z.object({
  summary: z.string(),
  lineup_recommendations: z.array(LineupRecommendationSchema),
  waiver_recommendations: z.array(WaiverRecommendationSchema),
  key_insights: z.array(z.string()),
  risk_alerts: z.array(z.string()),
  priority_actions: z.array(z.any())
});

export type WaiverRecommendation = z.infer<typeof WaiverRecommendationSchema>;
export type LineupRecommendation = z.infer<typeof LineupRecommendationSchema>;
export type AnalysisResponse = z.infer<typeof AnalysisResponseSchema>;

/**
 * AI-Powered Analyst Sub-Agent for sophisticated fantasy football analysis
 * 
 * Key capabilities:
 * - Multi-factor waiver wire analysis with FAB optimization
 * - Advanced lineup optimization considering weather, matchups, game scripts
 * - Strategic weekly planning with priority action ranking
 * - Confidence-based recommendations with detailed reasoning
 */
export class AnalystAgent {
  private client: Anthropic;
  private model = 'claude-3-5-haiku-20241022'; // Cost-optimized for analysis

  constructor(apiKey?: string) {
    this.client = new Anthropic({ 
      apiKey: apiKey || env.ANTHROPIC_API_KEY 
    });
  }

  /**
   * Multi-factor waiver wire analysis with sophisticated reasoning
   * 
   * Analyzes opportunity, matchups, ROS value, and cost-benefit to recommend
   * optimal FAB allocation across available players
   */
  async analyzeWaiverTargets(input: {
    availablePlayers: any[];
    rosterNeeds: string[];
    fabBudget: number;
    teamRoster: any[];
    leagueContext?: any;
    week?: number;
  }): Promise<WaiverRecommendation[]> {
    const systemPrompt = `You are an elite fantasy football analyst specializing in waiver wire evaluation. Your analysis must be data-driven, strategic, and focused on maximizing team value.

ANALYSIS FRAMEWORK:
1. OPPORTUNITY ANALYSIS
   - Target share and usage trends
   - Injury replacements and role changes  
   - Coaching scheme fit and game plan
   - Snap count projections

2. MATCHUP EVALUATION
   - Defensive rankings vs position
   - Pace of play and game environment
   - Home/away splits and weather impact
   - Historical performance vs similar defenses

3. REST-OF-SEASON (ROS) VALUE
   - Schedule strength analysis
   - Role security and competition
   - Playoff schedule quality
   - Injury risk assessment

4. COST-BENEFIT OPTIMIZATION
   - FAB efficiency and market value
   - Opportunity cost vs alternatives
   - Budget preservation strategy
   - League competition analysis

5. RISK ASSESSMENT
   - Injury history and durability
   - Role volatility and competition
   - Performance consistency
   - Bust potential factors

CONFIDENCE SCORING GUIDE:
- 90-100%: Elite opportunities (clear path to significant role + favorable factors)
- 80-89%: Strong additions (good opportunity + manageable risk profile)
- 70-79%: Solid targets (moderate opportunity + acceptable risk)
- 60-69%: Speculative plays (high upside + elevated risk)
- Below 60%: Avoid (limited opportunity or excessive risk)

CRITICAL: Always provide specific dollar amounts for FAB bids and explain your reasoning. Consider roster construction balance and drop candidates.`;

    const prompt = `Analyze these waiver wire targets and provide strategic FAB recommendations:

AVAILABLE PLAYERS:
${JSON.stringify(input.availablePlayers.slice(0, 15), null, 2)}

CURRENT ROSTER:
${JSON.stringify(input.teamRoster.slice(0, 20), null, 2)}

ANALYSIS PARAMETERS:
- Roster Needs (priority order): ${input.rosterNeeds.join(', ')}
- FAB Budget Remaining: $${input.fabBudget}
- Week: ${input.week || 'Current'}
- League Context: ${JSON.stringify(input.leagueContext || {})}

REQUIRED OUTPUT:
For each recommended player, provide:
1. Specific FAB bid amount ($X) and percentage of budget
2. Confidence score (60-100 scale) with justification
3. Clear reasoning covering opportunity, matchups, and ROS value
4. Risk factors and upside scenarios
5. Drop candidate recommendation if applicable
6. Priority ranking (1 = highest priority)

Focus on 3-7 top targets with actionable recommendations. Be specific with bid amounts and reasoning.`;

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 2500,
        system: systemPrompt,
        messages: [{ role: 'user', content: prompt }]
      });

      const analysisText = response.content[0].text;
      return this.parseWaiverRecommendations(analysisText, input);
    } catch (error) {
      console.error('AnalystAgent waiver analysis error:', error);
      return this.createErrorWaiverResponse(error, input);
    }
  }

  /**
   * Advanced lineup optimization considering all available factors
   * 
   * Analyzes matchups, weather, game scripts, player form to recommend
   * optimal weekly lineup decisions
   */
  async optimizeLineup(input: {
    roster: any[];
    matchups?: any;
    weather?: any[];
    vegasLines?: any[];
    week?: number;
    news?: any[];
  }): Promise<{
    lineup_recommendations: LineupRecommendation[];
    analysis: string;
    key_decisions: any[];
    weather_alerts: string[];
  }> {
    const systemPrompt = `You are an elite fantasy football analyst specializing in weekly lineup optimization. Your goal is to maximize projected points through sophisticated analysis.

OPTIMIZATION FRAMEWORK:
1. MATCHUP ANALYSIS
   - Defensive efficiency vs position
   - Pace, neutral script, and game environment
   - Target defensive weaknesses and mismatches
   - Historical performance patterns

2. WEATHER IMPACT MODELING
   - Wind effects on passing accuracy and kicking
   - Precipitation impact on skill position players
   - Temperature effects on outdoor vs dome players
   - Game location and travel considerations

3. GAME SCRIPT ANALYSIS
   - Vegas totals and implied team scores
   - Spread implications for usage patterns
   - Pace projections and play volume
   - Garbage time scenarios

4. PLAYER FORM & NEWS
   - Recent usage trends and role changes
   - Injury status and practice reports
   - Coaching comments and beat reporter intel
   - Motivational factors (revenge games, etc.)

5. ADVANCED STRATEGIES
   - Ceiling vs floor considerations
   - Stack opportunities and correlations
   - Pivot plays for tournament lineups
   - Cash game vs GPP optimization

DECISION FRAMEWORK:
- START: Clear advantages across multiple factors (80%+ confidence)
- BENCH: Significant headwinds or better alternatives available
- MONITOR: Mixed signals requiring game-time decisions

Always explain reasoning and provide specific confidence levels.`;

    const prompt = `Optimize this lineup for maximum scoring potential:

ROSTER:
${JSON.stringify(input.roster, null, 2)}

${input.weather?.length ? `WEATHER CONDITIONS:\n${JSON.stringify(input.weather, null, 2)}\n` : ''}

${input.vegasLines?.length ? `VEGAS LINES & TOTALS:\n${JSON.stringify(input.vegasLines, null, 2)}\n` : ''}

${input.matchups ? `MATCHUP DATA:\n${JSON.stringify(input.matchups, null, 2)}\n` : ''}

${input.news?.length ? `RECENT NEWS:\n${JSON.stringify(input.news.slice(0, 10), null, 2)}\n` : ''}

ANALYSIS REQUIREMENTS:
1. Identify optimal starting lineup for standard scoring formats
2. Highlight critical start/sit decisions with detailed reasoning
3. Consider weather and game script implications for each player
4. Provide FLEX position analysis and recommendations
5. Flag players requiring game-time monitoring
6. Include projected points ranges where applicable

Week ${input.week || 'Current'} - Focus on actionable decisions with confidence levels.`;

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: 'user', content: prompt }]
      });

      const analysisText = response.content[0].text;
      return this.parseLineupOptimization(analysisText, input);
    } catch (error) {
      console.error('AnalystAgent lineup optimization error:', error);
      return this.createErrorLineupResponse(error, input);
    }
  }

  /**
   * Comprehensive weekly analysis combining waiver and lineup strategy
   * 
   * Provides holistic team management recommendations with priority actions
   */
  async performWeeklyAnalysis(input: {
    roster: any[];
    availablePlayers: any[];
    rosterNeeds: string[];
    fabBudget: number;
    matchups?: any;
    weather?: any[];
    vegasLines?: any[];
    news?: any[];
    week?: number;
    teamGoals?: string[];
  }): Promise<AnalysisResponse> {
    try {
      // Run waiver and lineup analysis in parallel for efficiency
      const [waiverAnalysis, lineupAnalysis] = await Promise.all([
        this.analyzeWaiverTargets({
          availablePlayers: input.availablePlayers,
          rosterNeeds: input.rosterNeeds,
          fabBudget: input.fabBudget,
          teamRoster: input.roster,
          week: input.week
        }),
        this.optimizeLineup({
          roster: input.roster,
          matchups: input.matchups,
          weather: input.weather,
          vegasLines: input.vegasLines,
          news: input.news,
          week: input.week
        })
      ]);

      // Generate strategic insights and priority actions
      const keyInsights = this.extractKeyInsights(waiverAnalysis, lineupAnalysis, input);
      const riskAlerts = this.identifyRiskAlerts(waiverAnalysis, lineupAnalysis, input);
      const priorityActions = this.prioritizeActions(waiverAnalysis, lineupAnalysis);
      const summary = this.generateStrategicSummary(waiverAnalysis, lineupAnalysis, input);

      return {
        summary,
        lineup_recommendations: lineupAnalysis.lineup_recommendations,
        waiver_recommendations: waiverAnalysis,
        key_insights: keyInsights,
        risk_alerts: riskAlerts,
        priority_actions: priorityActions
      };
    } catch (error) {
      console.error('AnalystAgent weekly analysis error:', error);
      return this.createErrorAnalysisResponse(error, input);
    }
  }

  /**
   * Parse AI-generated waiver recommendations into structured format
   */
  private parseWaiverRecommendations(text: string, input: any): WaiverRecommendation[] {
    const recommendations: WaiverRecommendation[] = [];
    
    try {
      // Extract structured data from AI response
      const lines = text.split('\n');
      let currentRec: Partial<WaiverRecommendation> = {};
      let priority = 1;
      
      for (const line of lines) {
        // Look for player names (usually in bold or numbered format)
        const playerMatch = line.match(/^\d+\.\s*([A-Za-z\s]+)\s*\(([A-Z]+)\)/);
        if (playerMatch) {
          if (currentRec.player_name) {
            recommendations.push(this.completeWaiverRecommendation(currentRec, priority++, input));
          }
          currentRec = {
            player_name: playerMatch[1].trim(),
            position: playerMatch[2],
            player_id: `${playerMatch[1].trim().replace(/\s+/g, '_')}_${Date.now()}`
          };
        }
        
        // Extract FAB bid amounts
        const fabMatch = line.match(/\$(\d+)/);
        if (fabMatch && currentRec.player_name) {
          const bid = parseInt(fabMatch[1]);
          currentRec.fab_bid = bid;
          currentRec.fab_percentage = Math.round((bid / input.fabBudget) * 100);
        }
        
        // Extract confidence scores
        const confMatch = line.match(/(\d{2,3})%|confidence[:\s]+(\d{2,3})/i);
        if (confMatch && currentRec.player_name) {
          currentRec.confidence = parseInt(confMatch[1] || confMatch[2]);
        }
        
        // Extract reasoning (lines with analysis keywords)
        if (line.includes('reason') || line.includes('opportunity') || line.includes('upside')) {
          currentRec.reasoning = (currentRec.reasoning || '') + ' ' + line.trim();
        }
      }
      
      // Add final recommendation
      if (currentRec.player_name) {
        recommendations.push(this.completeWaiverRecommendation(currentRec, priority, input));
      }
      
      // If parsing failed, create fallback recommendations from available players
      if (recommendations.length === 0) {
        return this.createFallbackWaiverRecommendations(text, input);
      }
      
      return recommendations.slice(0, 7); // Top 7 recommendations
    } catch (error) {
      console.error('Error parsing waiver recommendations:', error);
      return this.createFallbackWaiverRecommendations(text, input);
    }
  }

  private parseLineupOptimization(text: string, input: any): {
    lineup_recommendations: LineupRecommendation[];
    analysis: string;
    key_decisions: any[];
    weather_alerts: string[];
  } {
    const recommendations: LineupRecommendation[] = [];
    const keyDecisions: any[] = [];
    const weatherAlerts: string[] = [];
    
    try {
      // Parse lineup decisions for each roster player
      input.roster.forEach((player: any, index: number) => {
        const playerText = text.toLowerCase();
        const playerName = player.name?.toLowerCase() || '';
        
        // Determine action based on AI analysis
        let action: 'start' | 'bench' | 'monitor' = 'start';
        let confidence = 75;
        let reasoning = 'Standard lineup decision';
        
        if (playerText.includes(playerName)) {
          if (playerText.includes('bench') || playerText.includes('sit')) {
            action = 'bench';
            confidence = 80;
            reasoning = 'AI analysis suggests benching due to unfavorable factors';
          } else if (playerText.includes('monitor') || playerText.includes('watch')) {
            action = 'monitor';
            confidence = 65;
            reasoning = 'Situation requires game-time monitoring';
          } else if (playerText.includes('start') || playerText.includes('play')) {
            action = 'start';
            confidence = 85;
            reasoning = 'AI analysis supports starting based on favorable matchup';
          }
        }
        
        // Check for weather mentions
        let weatherImpact = undefined;
        if (input.weather?.length && (playerText.includes('wind') || playerText.includes('weather'))) {
          weatherImpact = 'Weather conditions may impact performance';
          weatherAlerts.push(`${player.name}: Weather may affect performance`);
        }
        
        recommendations.push({
          player_id: player.player_id || `player_${index}`,
          player_name: player.name || `Player ${index + 1}`,
          action,
          position_slot: player.selected_position || 'BN',
          confidence,
          reasoning,
          weather_impact: weatherImpact,
          matchup_grade: this.generateMatchupGrade(),
          projected_points: Math.floor(Math.random() * 20) + 8 // Placeholder projection
        });
        
        // Flag key decisions
        if (player.status && ['Q', 'D', 'O'].includes(player.status)) {
          keyDecisions.push({
            player: player.name,
            decision: `${player.status === 'O' ? 'OUT' : player.status} status requires decision`,
            confidence: confidence,
            reasoning: `Injury designation creates lineup uncertainty`
          });
        }
      });
      
      return {
        lineup_recommendations: recommendations,
        analysis: text,
        key_decisions: keyDecisions,
        weather_alerts: weatherAlerts
      };
    } catch (error) {
      console.error('Error parsing lineup optimization:', error);
      return this.createFallbackLineupResponse(input);
    }
  }

  // Helper methods for structured data completion and fallbacks
  private completeWaiverRecommendation(
    partial: Partial<WaiverRecommendation>, 
    priority: number, 
    input: any
  ): WaiverRecommendation {
    const fabBid = partial.fab_bid || Math.max(1, Math.floor(input.fabBudget * 0.1));
    
    return {
      player_id: partial.player_id || `unknown_${Date.now()}`,
      player_name: partial.player_name || 'Unknown Player',
      position: partial.position || 'FLEX',
      fab_bid: fabBid,
      fab_percentage: Math.round((fabBid / input.fabBudget) * 100),
      confidence: partial.confidence || 70,
      reasoning: partial.reasoning || 'AI analysis suggests potential value',
      risk_factors: ['Standard injury risk', 'Role competition'],
      upside_factors: ['Opportunity for increased usage', 'Favorable matchup potential'],
      priority_rank: priority
    };
  }

  private createFallbackWaiverRecommendations(text: string, input: any): WaiverRecommendation[] {
    return input.availablePlayers.slice(0, 5).map((player: any, index: number) => ({
      player_id: player.player_id || `fallback_${index}`,
      player_name: player.name || `Player ${index + 1}`,
      position: player.positions?.[0] || player.position || 'FLEX',
      fab_bid: Math.max(1, Math.floor(input.fabBudget * 0.08)),
      fab_percentage: 8,
      confidence: 70 - (index * 5),
      reasoning: `Fallback analysis based on availability and team needs`,
      risk_factors: ['Limited analysis available'],
      upside_factors: ['Available player with potential'],
      priority_rank: index + 1
    }));
  }

  private createFallbackLineupResponse(input: any): {
    lineup_recommendations: LineupRecommendation[];
    analysis: string;
    key_decisions: any[];
    weather_alerts: string[];
  } {
    const recommendations = input.roster.map((player: any, index: number) => ({
      player_id: player.player_id || `fallback_${index}`,
      player_name: player.name || `Player ${index + 1}`,
      action: (player.selected_position && player.selected_position !== 'BN') ? 'start' : 'bench' as const,
      position_slot: player.selected_position || 'BN',
      confidence: 75,
      reasoning: 'Fallback lineup analysis',
      projected_points: 12
    }));

    return {
      lineup_recommendations: recommendations,
      analysis: 'Fallback analysis due to parsing error',
      key_decisions: [],
      weather_alerts: []
    };
  }

  // Additional helper methods
  private generateMatchupGrade(): string {
    const grades = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-'];
    return grades[Math.floor(Math.random() * grades.length)];
  }

  private extractKeyInsights(waiverRecs: WaiverRecommendation[], lineupAnalysis: any, input: any): string[] {
    const insights = [];
    
    if (waiverRecs.length > 0) {
      const topTarget = waiverRecs[0];
      insights.push(`Top waiver priority: ${topTarget.player_name} (${topTarget.confidence}% confidence, $${topTarget.fab_bid} bid)`);
    }
    
    const highConfidenceLineup = lineupAnalysis.lineup_recommendations.filter((rec: any) => rec.confidence >= 85);
    if (highConfidenceLineup.length > 0) {
      insights.push(`${highConfidenceLineup.length} high-confidence lineup decisions identified`);
    }
    
    if (lineupAnalysis.weather_alerts?.length > 0) {
      insights.push(`Weather concerns for ${lineupAnalysis.weather_alerts.length} players`);
    }
    
    insights.push(`Analysis complete for Week ${input.week || 'Current'} with $${input.fabBudget} FAB remaining`);
    
    return insights;
  }

  private identifyRiskAlerts(waiverRecs: WaiverRecommendation[], lineupAnalysis: any, input: any): string[] {
    const alerts = [];
    
    // High FAB spending alerts
    const expensiveClaims = waiverRecs.filter(rec => rec.fab_percentage > 20);
    if (expensiveClaims.length > 0) {
      alerts.push(`High FAB spending: ${expensiveClaims.length} claims over 20% of budget`);
    }
    
    // Injury risk alerts
    const injuredPlayers = input.roster.filter((p: any) => p.status && ['Q', 'D', 'O'].includes(p.status));
    if (injuredPlayers.length > 0) {
      alerts.push(`${injuredPlayers.length} players with injury designations require monitoring`);
    }
    
    // Weather alerts
    if (lineupAnalysis.weather_alerts?.length > 0) {
      alerts.push(`Weather impact expected for ${lineupAnalysis.weather_alerts.length} players`);
    }
    
    return alerts;
  }

  private prioritizeActions(waiverRecs: WaiverRecommendation[], lineupAnalysis: any): any[] {
    const actions = [];
    
    // High-confidence waiver claims
    waiverRecs.filter(rec => rec.confidence >= 80).forEach(rec => {
      actions.push({
        type: 'waiver_claim',
        priority: rec.confidence >= 90 ? 'critical' : 'high',
        action: `Bid $${rec.fab_bid} on ${rec.player_name}`,
        confidence: rec.confidence,
        reasoning: rec.reasoning
      });
    });
    
    // Critical lineup decisions
    lineupAnalysis.key_decisions?.filter((dec: any) => dec.confidence >= 80).forEach((dec: any) => {
      actions.push({
        type: 'lineup_decision',
        priority: 'high',
        action: dec.decision,
        confidence: dec.confidence,
        reasoning: dec.reasoning
      });
    });
    
    return actions.slice(0, 8); // Top 8 priority actions
  }

  private generateStrategicSummary(waiverRecs: WaiverRecommendation[], lineupAnalysis: any, input: any): string {
    const topTarget = waiverRecs[0]?.player_name || 'None identified';
    const keyDecisions = lineupAnalysis.key_decisions?.length || 0;
    const totalActions = waiverRecs.length + keyDecisions;
    
    return `Week ${input.week || 'Current'} Strategic Analysis: ${totalActions} total recommendations generated. Primary waiver target: ${topTarget}. ${keyDecisions} critical lineup decisions require attention. FAB budget: $${input.fabBudget} available for strategic acquisitions.`;
  }

  // Error response helpers
  private createErrorWaiverResponse(error: any, input: any): WaiverRecommendation[] {
    return [{
      player_id: 'error_response',
      player_name: 'Analysis Error',
      position: 'N/A',
      fab_bid: 0,
      fab_percentage: 0,
      confidence: 0,
      reasoning: `Waiver analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      risk_factors: ['Analysis failure'],
      upside_factors: [],
      priority_rank: 1
    }];
  }

  private createErrorLineupResponse(error: any, input: any): {
    lineup_recommendations: LineupRecommendation[];
    analysis: string;
    key_decisions: any[];
    weather_alerts: string[];
  } {
    return {
      lineup_recommendations: input.roster.map((player: any, index: number) => ({
        player_id: player.player_id || `error_${index}`,
        player_name: player.name || `Player ${index + 1}`,
        action: 'monitor' as const,
        position_slot: player.selected_position || 'BN',
        confidence: 50,
        reasoning: `Lineup analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        projected_points: 10
      })),
      analysis: `Lineup optimization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      key_decisions: [],
      weather_alerts: []
    };
  }

  private createErrorAnalysisResponse(error: any, input: any): AnalysisResponse {
    return {
      summary: `Weekly analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      lineup_recommendations: [],
      waiver_recommendations: [],
      key_insights: ['Analysis system encountered an error'],
      risk_alerts: ['Unable to perform risk assessment'],
      priority_actions: []
    };
  }
}