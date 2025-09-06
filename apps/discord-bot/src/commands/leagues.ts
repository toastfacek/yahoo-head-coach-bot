import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, MessageFlags } from 'discord.js';
import { BotCommand } from '../types/discord';
import { yahooAuth } from '../services/yahooAuth';
import { yahooApi } from '../services/yahooApi';
import { authLogger } from '../utils/logger';

export const leaguesCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('leagues')
    .setDescription('Show all your Yahoo Fantasy Football leagues'),

  async execute(interaction: ChatInputCommandInteraction) {
    const discordId = interaction.user.id;
    const executionId = Math.random().toString(36).substring(7);

    authLogger.info({ discordId, executionId }, 'Leagues command started');

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

      // Get user's leagues
      authLogger.info({ discordId }, 'Fetching user leagues from Yahoo API');
      const leaguesResult = await yahooApi.getUserLeagues(discordId);

      if (!leaguesResult.success) {
        authLogger.error({ discordId, error: leaguesResult.error }, 'Failed to fetch leagues');
        
        const embed = new EmbedBuilder()
          .setTitle('❌ Failed to Load Leagues')
          .setDescription(
            `Error: ${leaguesResult.error}\n\n` +
            'This might be a temporary issue. Try again in a few moments, or use `/auth status` to check your connection.'
          )
          .setColor(0xff0000);

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      const leagues = leaguesResult.data || [];

      if (leagues.length === 0) {
        const embed = new EmbedBuilder()
          .setTitle('📋 No Leagues Found')
          .setDescription(
            'No Yahoo Fantasy Football leagues found for your account.\n\n' +
            '• Make sure you\'re part of at least one league\n' +
            '• Check that your leagues are for the current season\n' +
            '• Try refreshing your connection with `/auth logout` then `/auth login`'
          )
          .setColor(0xff9900);

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Create embeds for leagues
      const embed = new EmbedBuilder()
        .setTitle('🏈 Your Fantasy Football Leagues')
        .setDescription(`Found **${leagues.length}** league${leagues.length !== 1 ? 's' : ''}`)
        .setColor(0x00ff00);

      // Add each league as a field
      leagues.forEach((league, index) => {
        embed.addFields({
          name: `${index + 1}. ${league.name}`,
          value: `**Season:** ${league.season}\n**League ID:** \`${league.id}\`\n**Sport:** ${league.sport.toUpperCase()}`,
          inline: true
        });
      });

      embed.setFooter({ 
        text: 'Use /standings [league] to see standings, or /roster [league] to see your roster' 
      });

      await interaction.editReply({ embeds: [embed] });
      authLogger.info({ discordId, leagueCount: leagues.length }, 'Successfully displayed user leagues');

    } catch (error: any) {
      authLogger.error({ error: error.message, discordId, executionId }, 'Leagues command error');
      
      try {
        const errorMessage = 'An error occurred while fetching your leagues. Please try again later.';
        if (interaction.deferred) {
          await interaction.editReply({ content: errorMessage });
        } else {
          await interaction.reply({ content: errorMessage, flags: MessageFlags.Ephemeral });
        }
      } catch (replyError) {
        authLogger.error({ replyError, discordId }, 'Failed to send error response for leagues command');
      }
    }
  }
};