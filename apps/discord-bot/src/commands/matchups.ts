import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, MessageFlags } from 'discord.js';
import { BotCommand } from '../types/discord';
import { yahooAuth } from '../services/yahooAuth';
import { yahooApi } from '../services/yahooApi';
import { authLogger } from '../utils/logger';

export const matchupsCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('matchups')
    .setDescription('Show weekly matchups with live scoring and projections')
    .addStringOption(option =>
      option
        .setName('league')
        .setDescription('League ID or name (leave empty to auto-select if you have only one league)')
        .setRequired(false)
    )
    .addIntegerOption(option =>
      option
        .setName('week')
        .setDescription('Week number (leave empty for current week)')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(18)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const discordId = interaction.user.id;
    const executionId = Math.random().toString(36).substring(7);
    const leagueInput = interaction.options.getString('league');
    const week = interaction.options.getInteger('week');

    authLogger.info({ discordId, executionId, leagueInput, week }, 'Matchups command started');

    try {
      // Defer the reply since we'll be making API calls
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      // Check authentication first
      const isAuthenticated = await yahooAuth.isAuthenticated(discordId);
      if (!isAuthenticated) {
        const embed = new EmbedBuilder()
          .setTitle('🔒 Authentication Required')
          .setDescription('You need to connect your Yahoo Fantasy Football account first.\n\nUse `/auth login` to get started!')
          .setColor(0xff0000);

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Get user's leagues to determine which league to use
      authLogger.info({ discordId }, 'Fetching user leagues');
      const leaguesResult = await yahooApi.getUserLeagues(discordId);

      if (!leaguesResult.success || !leaguesResult.data) {
        authLogger.error({ discordId, error: leaguesResult.error }, 'Failed to fetch leagues');
        
        const embed = new EmbedBuilder()
          .setTitle('❌ Failed to Load Leagues')
          .setDescription(`Error: ${leaguesResult.error}\n\nUse \`/auth status\` to check your connection.`)
          .setColor(0xff0000);

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      const leagues = leaguesResult.data;

      if (leagues.length === 0) {
        const embed = new EmbedBuilder()
          .setTitle('📋 No Leagues Found')
          .setDescription('No leagues found. Use `/leagues` to see your available leagues.')
          .setColor(0xff9900);

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Determine which league to use
      let targetLeague;
      
      if (leagueInput) {
        // Try to find league by ID or name
        targetLeague = leagues.find(league => 
          league.id === leagueInput || 
          league.name.toLowerCase().includes(leagueInput.toLowerCase())
        );
        
        if (!targetLeague) {
          const embed = new EmbedBuilder()
            .setTitle('❌ League Not Found')
            .setDescription(
              `Could not find a league matching "${leagueInput}"\n\n` +
              'Use `/leagues` to see your available leagues.'
            )
            .setColor(0xff0000);

          await interaction.editReply({ embeds: [embed] });
          return;
        }
      } else {
        // Auto-select if only one league
        if (leagues.length === 1) {
          targetLeague = leagues[0];
        } else {
          const embed = new EmbedBuilder()
            .setTitle('🔍 Multiple Leagues Found')
            .setDescription(
              `You have **${leagues.length}** leagues. Please specify which one:\n\n` +
              leagues.map((league, index) => `${index + 1}. **${league.name}** (ID: \`${league.id}\`)`).join('\n') +
              '\n\nUse `/matchups league:[league-name-or-id]`'
            )
            .setColor(0xff9900);

          await interaction.editReply({ embeds: [embed] });
          return;
        }
      }

      // Get current week if not specified
      let targetWeek = week;
      if (!targetWeek) {
        const currentWeekResult = await yahooApi.getCurrentWeek(discordId, targetLeague.leagueKey);
        if (currentWeekResult.success && currentWeekResult.data) {
          targetWeek = currentWeekResult.data;
        } else {
          targetWeek = 1; // Fallback to week 1
        }
      }

      // Get matchups for the target league and week
      authLogger.info({ discordId, leagueKey: targetLeague.leagueKey, week: targetWeek }, 'Fetching league matchups');
      const matchupsResult = await yahooApi.getLeagueMatchups(discordId, targetLeague.leagueKey, targetWeek);

      if (!matchupsResult.success || !matchupsResult.data) {
        authLogger.error({ discordId, error: matchupsResult.error, leagueKey: targetLeague.leagueKey, week: targetWeek }, 'Failed to fetch matchups');
        
        const embed = new EmbedBuilder()
          .setTitle('❌ Failed to Load Matchups')
          .setDescription(
            `Error loading matchups for **${targetLeague.name}** Week ${targetWeek}:\n${matchupsResult.error}\n\n` +
            'This might be a temporary issue or the week may not be available yet.'
          )
          .setColor(0xff0000);

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      const matchups = matchupsResult.data;

      if (matchups.length === 0) {
        const embed = new EmbedBuilder()
          .setTitle('📊 No Matchups Available')
          .setDescription(
            `No matchup data available for **${targetLeague.name}** Week ${targetWeek}\n\n` +
            'This usually means the week hasn\'t started yet or there\'s an issue with the league data.'
          )
          .setColor(0xff9900);

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Create matchups embed
      const embed = new EmbedBuilder()
        .setTitle(`⚔️ ${targetLeague.name} - Week ${targetWeek} Matchups`)
        .setDescription(`**${matchups.length}** matchup${matchups.length !== 1 ? 's' : ''}`)
        .setColor(0x00ff00);

      // Add each matchup as a field
      matchups.forEach((matchup, index) => {
        const team1 = matchup.team1;
        const team2 = matchup.team2;
        
        const matchupTitle = `${team1.name} vs ${team2.name}`;
        
        let matchupDetails = '';
        
        // Current scores
        matchupDetails += `**${team1.name}:** ${team1.points.toFixed(1)} pts\n`;
        matchupDetails += `**${team2.name}:** ${team2.points.toFixed(1)} pts\n\n`;
        
        // Projections if available
        if (team1.projectedPoints > 0 || team2.projectedPoints > 0) {
          matchupDetails += `**Projected:**\n`;
          matchupDetails += `${team1.name}: ${team1.projectedPoints.toFixed(1)} pts\n`;
          matchupDetails += `${team2.name}: ${team2.projectedPoints.toFixed(1)} pts\n\n`;
        }
        
        // Win probability if available
        if (team1.winProbability !== undefined && team2.winProbability !== undefined) {
          matchupDetails += `**Win Probability:**\n`;
          matchupDetails += `${team1.name}: ${(team1.winProbability * 100).toFixed(0)}%\n`;
          matchupDetails += `${team2.name}: ${(team2.winProbability * 100).toFixed(0)}%\n\n`;
        }
        
        // Games tracking if available
        if (team1.gamesRemaining !== undefined) {
          matchupDetails += `**Games Remaining:** ${team1.gamesRemaining}\n`;
        }
        if (team1.gamesLive !== undefined && team1.gamesLive > 0) {
          matchupDetails += `**Live Games:** ${team1.gamesLive}\n`;
        }
        if (team1.gamesCompleted !== undefined) {
          matchupDetails += `**Completed Games:** ${team1.gamesCompleted}\n`;
        }
        
        // Add divider between matchups (except the last one)
        if (index < matchups.length - 1) {
          matchupDetails += '━━━━━━━━━━━━━━━━';
        }
        
        // Discord field value has a 1024 character limit
        if (matchupDetails.length > 1024) {
          matchupDetails = matchupDetails.substring(0, 1020) + '...';
        }
        
        embed.addFields({
          name: `🏈 ${matchupTitle}`,
          value: matchupDetails,
          inline: false
        });
      });

      // Footer with helpful info
      let footerText = 'Live scores update during games';
      if (matchups[0]?.status) {
        footerText += ` • Status: ${matchups[0].status}`;
      }
      embed.setFooter({ text: footerText });

      await interaction.editReply({ embeds: [embed] });
      authLogger.info({ discordId, leagueKey: targetLeague.leagueKey, week: targetWeek, matchupCount: matchups.length }, 'Successfully displayed league matchups');

    } catch (error: any) {
      authLogger.error({ error: error.message, discordId, executionId }, 'Matchups command error');
      
      try {
        const errorMessage = 'An error occurred while fetching matchups. Please try again later.';
        if (interaction.deferred) {
          await interaction.editReply({ content: errorMessage });
        } else {
          await interaction.reply({ content: errorMessage, flags: MessageFlags.Ephemeral });
        }
      } catch (replyError) {
        authLogger.error({ replyError, discordId }, 'Failed to send error response for matchups command');
      }
    }
  }
};