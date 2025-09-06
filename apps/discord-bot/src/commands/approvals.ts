import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { BotCommand } from '../types/discord';
import { orchestratorApi } from '../services/orchestratorApi';
import { userService } from '../services/userService';
import { discordLogger } from '../utils/logger';

export const approvalsCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('approvals')
    .setDescription('View and manage pending fantasy football recommendations')
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
    if (!isAuth) {
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
        const leagues = await orchestratorApi.getUserLeagues(discordId);
        if (leagues.length === 0) {
          await interaction.editReply({
            content: '❌ No fantasy leagues found for your account.'
          });
          return;
        }
        targetLeagueId = leagues[0].id; // Use first league as default
      }

      // Get pending approvals
      const pendingApprovals = await orchestratorApi.getPendingApprovals(discordId, targetLeagueId!);

      if (pendingApprovals.length === 0) {
        const embed = new EmbedBuilder()
          .setTitle('✅ No Pending Approvals')
          .setDescription('You have no recommendations waiting for approval. All systems are running smoothly!')
          .setColor(0x00ff00)
          .setFooter({
            text: `League: ${targetLeagueId} • ${new Date().toLocaleString()}`
          });

        await interaction.editReply({
          embeds: [embed]
        });
        return;
      }

      // Create embeds for each pending approval
      const embeds = [];
      const components = [];

      for (let i = 0; i < Math.min(pendingApprovals.length, 5); i++) { // Discord limit of 10 embeds, keeping it to 5
        const approval = pendingApprovals[i];
        
        const embed = new EmbedBuilder()
          .setTitle(`🤔 Recommendation ${i + 1} - Awaiting Your Decision`)
          .setColor(0xffa500); // Orange for pending

        // Format the recommendation details
        let description = '';
        if (approval.type === 'LINEUP_SWAP') {
          description = `**Lineup Change**\n`;
          description += `Start: **${approval.data?.in?.player_name || 'Unknown Player'}**\n`;
          description += `Bench: **${approval.data?.out?.player_name || 'Unknown Player'}**\n`;
        } else if (approval.type === 'WAIVER_CLAIM') {
          description = `**Waiver Claim**\n`;
          description += `Add: **${approval.data?.add?.player_name || 'Unknown Player'}**\n`;
          description += `Drop: **${approval.data?.drop?.player_name || 'Unknown Player'}**\n`;
          if (approval.data?.fab_bid) {
            description += `FAB Bid: **$${approval.data.fab_bid}**\n`;
          }
        } else {
          description = `**${approval.type}**\n`;
          description += approval.summary || 'Recommendation details not available';
        }

        description += `\n**Confidence:** ${Math.round(approval.confidence * 100)}%`;
        description += `\n**Reason:** ${approval.reason || 'No reason provided'}`;

        embed.setDescription(description);

        if (approval.notes) {
          embed.addFields({
            name: '📝 Additional Notes',
            value: approval.notes,
            inline: false
          });
        }

        embed.setFooter({
          text: `ID: ${approval.id} • Created: ${new Date(approval.created_at).toLocaleString()}`
        });

        embeds.push(embed);

        // Create action buttons for this recommendation
        const actionRow = new ActionRowBuilder<ButtonBuilder>()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`approve:${approval.id}`)
              .setLabel('✅ Approve & Execute')
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId(`reject:${approval.id}`)
              .setLabel('❌ Reject')
              .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
              .setCustomId(`details:${approval.id}`)
              .setLabel('📋 More Details')
              .setStyle(ButtonStyle.Secondary)
          );

        components.push(actionRow);
      }

      // Add a summary embed at the top
      const summaryEmbed = new EmbedBuilder()
        .setTitle('⏳ Pending Recommendations')
        .setDescription(
          `You have **${pendingApprovals.length}** recommendation${pendingApprovals.length === 1 ? '' : 's'} waiting for your approval.\n\n` +
          'Review each recommendation below and decide whether to approve or reject it.\n' +
          '• **Approve**: The action will be executed immediately\n' +
          '• **Reject**: The recommendation will be discarded\n' +
          '• **More Details**: Get additional context and analysis'
        )
        .setColor(0x430297)
        .setFooter({
          text: `League: ${targetLeagueId} • Use the buttons below each recommendation`
        });

      // Add the summary embed at the beginning
      embeds.unshift(summaryEmbed);

      // Send the response with embeds and buttons
      await interaction.editReply({
        embeds: embeds.slice(0, 10), // Discord limit
        components: components.slice(0, 5) // Discord limit
      });

      if (pendingApprovals.length > 5) {
        await interaction.followUp({
          content: `⚠️ You have ${pendingApprovals.length - 5} additional pending recommendations. Use this command again to see more.`,
          flags: MessageFlags.Ephemeral,
        });
      }

      discordLogger.info({ 
        discordId, 
        leagueId: targetLeagueId, 
        pendingCount: pendingApprovals.length 
      }, 'Displayed pending approvals');

    } catch (error) {
      discordLogger.error({ error, discordId, leagueId }, 'Failed to get pending approvals');
      
      await interaction.editReply({
        content: '❌ Failed to retrieve pending approvals. Please try again later.'
      });
    }
  },
};
