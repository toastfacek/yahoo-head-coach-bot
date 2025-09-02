import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, MessageFlags } from 'discord.js';
import { BotCommand } from '../types/discord';
import { orchestratorApi } from '../services/orchestratorApi';
import { userService } from '../services/userService';
import { discordLogger } from '../utils/logger';

export const lineupCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('lineup')
    .setDescription('Analyze and optimize your fantasy lineup')
    .addStringOption(option =>
      option
        .setName('league')
        .setDescription('League ID (optional - will use your primary league if not specified)')
        .setRequired(false)
    ) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction) {
    const discordId = interaction.user.id;
    const leagueId = interaction.options.getString('league');

    // Check authentication; if missing, attempt to sync from orchestrator
    let isAuth = await userService.isAuthenticated(discordId);
    if (!isAuth) {
      const synced = await userService.ensureAuthenticated(discordId, interaction.user.username);
      isAuth = synced || (await userService.isAuthenticated(discordId));
    }
    let yahooUserId = await userService.getYahooUserId(discordId);
    if (!isAuth || !yahooUserId) {
      await interaction.reply({
        content: '🔐 You need to authenticate first. Use `/auth login` to connect your Yahoo account.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    try {
      await interaction.deferReply();

      // Get user's leagues if no league specified
      let targetLeagueId = leagueId;
      if (!targetLeagueId) {
        const leagues = await orchestratorApi.getUserLeagues(yahooUserId);
        if (leagues.length === 0) {
          await interaction.editReply({
            content: '❌ No fantasy leagues found for your account.'
          });
          return;
        }
        targetLeagueId = leagues[0].id; // Use first league as default
      }

      // Analyze lineup
      const lineupData = await orchestratorApi.checkLineup(yahooUserId, targetLeagueId!);

      // Create embed response
      const embed = new EmbedBuilder()
        .setTitle('📊 Lineup Analysis')
        .setDescription('Here\'s your optimized lineup analysis:')
        .setColor(0x430297);

      // Summary
      if (lineupData.summary.length > 0) {
        embed.addFields({
          name: '📋 Summary',
          value: lineupData.summary.join('\n'),
          inline: false
        });
      }

      // Lineup recommendations
      if (lineupData.lineup.length > 0) {
        const lineupText = lineupData.lineup
          .map(rec => `• ${rec.action} - **${rec.player}**\n  ${rec.reason} (${Math.round(rec.confidence * 100)}% confidence)`)
          .join('\n\n');
        
        embed.addFields({
          name: '🔄 Lineup Changes',
          value: lineupText.length > 1024 ? lineupText.substring(0, 1021) + '...' : lineupText,
          inline: false
        });
      } else {
        embed.addFields({
          name: '✅ Lineup Status',
          value: 'Your lineup looks optimal! No changes recommended.',
          inline: false
        });
      }

      // Notes
      if (lineupData.notes.length > 0) {
        embed.addFields({
          name: '📝 Notes',
          value: lineupData.notes.join('\n'),
          inline: false
        });
      }

      embed.setFooter({
        text: `League: ${targetLeagueId} • Generated: ${new Date().toLocaleString()}`
      });

      await interaction.editReply({
        embeds: [embed]
      });

      discordLogger.info({ discordId, yahooUserId, leagueId: targetLeagueId }, 'Lineup analysis completed');

    } catch (error) {
      discordLogger.error({ error, discordId, yahooUserId, leagueId }, 'Lineup analysis failed');
      
      await interaction.editReply({
        content: '❌ Failed to analyze your lineup. Please try again later.'
      });
    }
  },
};
