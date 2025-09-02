import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, MessageFlags } from 'discord.js';
import { BotCommand } from '../types/discord';
import { orchestratorApi } from '../services/orchestratorApi';
import { userService } from '../services/userService';
import { discordLogger } from '../utils/logger';

export const waiversCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('waivers')
    .setDescription('Analyze waiver wire opportunities')
    .addStringOption(option =>
      option
        .setName('league')
        .setDescription('League ID (optional - will use your primary league if not specified)')
        .setRequired(false)
    ) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction) {
    const discordId = interaction.user.id;
    const leagueId = interaction.options.getString('league');

    // Check authentication
    const isAuth = await userService.isAuthenticated(discordId);
    if (!isAuth) {
      await interaction.reply({
        content: '🔐 You need to authenticate first. Use `/auth login` to connect your Yahoo account.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const yahooUserId = await userService.getYahooUserId(discordId);
    if (!yahooUserId) {
      await interaction.reply({
        content: '❌ Authentication error. Please try `/auth logout` and `/auth login` again.',
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

      // Analyze waivers
      const waiverData = await orchestratorApi.analyzeWaivers(yahooUserId, targetLeagueId!);

      // Create embed response
      const embed = new EmbedBuilder()
        .setTitle('🔍 Waiver Wire Analysis')
        .setDescription('Here are the best waiver wire opportunities:')
        .setColor(0x430297);

      // Summary
      if (waiverData.summary.length > 0) {
        embed.addFields({
          name: '📋 Summary',
          value: waiverData.summary.join('\n'),
          inline: false
        });
      }

      // Waiver recommendations
      if (waiverData.waivers.length > 0) {
        const waiverText = waiverData.waivers
          .map(rec => {
            const fabText = rec.fab > 0 ? ` (Bid: $${rec.fab})` : '';
            return `• ${rec.action} - **${rec.player}**${fabText}\n  Confidence: ${Math.round(rec.confidence * 100)}%`;
          })
          .join('\n\n');
        
        embed.addFields({
          name: '🎯 Waiver Targets',
          value: waiverText.length > 1024 ? waiverText.substring(0, 1021) + '...' : waiverText,
          inline: false
        });
      } else {
        embed.addFields({
          name: '💤 Waiver Status',
          value: 'No compelling waiver wire targets found. Your roster looks solid!',
          inline: false
        });
      }

      // Notes
      if (waiverData.notes.length > 0) {
        embed.addFields({
          name: '📝 Notes',
          value: waiverData.notes.join('\n'),
          inline: false
        });
      }

      embed.setFooter({
        text: `League: ${targetLeagueId} • Generated: ${new Date().toLocaleString()}`
      });

      await interaction.editReply({
        embeds: [embed]
      });

      discordLogger.info({ discordId, yahooUserId, leagueId: targetLeagueId }, 'Waiver analysis completed');

    } catch (error) {
      discordLogger.error({ error, discordId, yahooUserId, leagueId }, 'Waiver analysis failed');
      
      await interaction.editReply({
        content: '❌ Failed to analyze waiver wire. Please try again later.'
      });
    }
  },
};
