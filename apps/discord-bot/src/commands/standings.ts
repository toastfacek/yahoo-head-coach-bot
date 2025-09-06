import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, MessageFlags } from 'discord.js';
import { BotCommand } from '../types/discord';
import { yahooAuth } from '../services/yahooAuth';
import { yahooApi } from '../services/yahooApi';
import { authLogger } from '../utils/logger';

export const standingsCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('standings')
    .setDescription('Show league standings')
    .addStringOption(option =>
      option
        .setName('league')
        .setDescription('League ID or name (leave empty to auto-select if you have only one league)')
        .setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const discordId = interaction.user.id;
    const executionId = Math.random().toString(36).substring(7);
    const leagueInput = interaction.options.getString('league');

    authLogger.info({ discordId, executionId, leagueInput }, 'Standings command started');

    try {
      // Defer the reply since we'll be making API calls
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      // Check authentication first
      const isAuthenticated = await yahooAuth.isAuthenticated(discordId);
      if (!isAuthenticated) {
        const embed = new EmbedBuilder()
          .setTitle('🔒 Authentication Required')
          .setDescription(
            'You need to connect your Yahoo Fantasy Football account first.\n\n' +
            'Use `/auth login` to get started!'
          )
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
          .setDescription(
            `Error: ${leaguesResult.error}\n\n` +
            'Use `/auth status` to check your connection.'
          )
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
              '\n\nUse `/standings league:[league-name-or-id]`'
            )
            .setColor(0xff9900);

          await interaction.editReply({ embeds: [embed] });
          return;
        }
      }

      // Get standings for the target league
      authLogger.info({ discordId, leagueKey: targetLeague.leagueKey }, 'Fetching league standings');
      const standingsResult = await yahooApi.getLeagueStandings(discordId, targetLeague.leagueKey);

      if (!standingsResult.success || !standingsResult.data) {
        authLogger.error({ discordId, error: standingsResult.error, leagueKey: targetLeague.leagueKey }, 'Failed to fetch standings');
        
        const embed = new EmbedBuilder()
          .setTitle('❌ Failed to Load Standings')
          .setDescription(
            `Error loading standings for ${targetLeague.name}:\n${standingsResult.error}\n\n` +
            'This might be a temporary issue or the season may not have started yet.'
          )
          .setColor(0xff0000);

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      const standings = standingsResult.data;

      if (standings.length === 0) {
        const embed = new EmbedBuilder()
          .setTitle('📊 No Standings Available')
          .setDescription(
            `No standings data available for **${targetLeague.name}**\n\n` +
            'This usually means the season hasn\'t started yet or there\'s an issue with the league data.'
          )
          .setColor(0xff9900);

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Create standings embed
      const embed = new EmbedBuilder()
        .setTitle(`🏆 ${targetLeague.name} - Standings`)
        .setDescription(`**Season ${targetLeague.season}** • **${standings.length}** teams`)
        .setColor(0x00ff00);

      // Add standings as fields (show top 10 to avoid Discord limits)
      const maxTeams = Math.min(standings.length, 10);
      for (let i = 0; i < maxTeams; i++) {
        const team = standings[i];
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${team.place}.`;
        
        embed.addFields({
          name: `${medal} ${team.name}`,
          value: `**Record:** ${team.record}`,
          inline: true
        });
      }

      if (standings.length > 10) {
        embed.setFooter({ text: `Showing top 10 of ${standings.length} teams` });
      }

      await interaction.editReply({ embeds: [embed] });
      authLogger.info({ discordId, leagueKey: targetLeague.leagueKey, teamCount: standings.length }, 'Successfully displayed league standings');

    } catch (error: any) {
      authLogger.error({ error: error.message, discordId, executionId }, 'Standings command error');
      
      try {
        const errorMessage = 'An error occurred while fetching league standings. Please try again later.';
        if (interaction.deferred) {
          await interaction.editReply({ content: errorMessage });
        } else {
          await interaction.reply({ content: errorMessage, flags: MessageFlags.Ephemeral });
        }
      } catch (replyError) {
        authLogger.error({ replyError, discordId }, 'Failed to send error response for standings command');
      }
    }
  }
};