import { Interaction, ChatInputCommandInteraction, ButtonInteraction, EmbedBuilder } from 'discord.js';
import { ExtendedClient } from '../types/discord';
import { discordLogger } from '../utils/logger';
import { userService } from '../services/userService';
import { orchestratorApi } from '../services/orchestratorApi';

export async function handleInteraction(client: ExtendedClient, interaction: Interaction) {
  try {
    if (interaction.isChatInputCommand()) {
      await handleSlashCommand(client, interaction);
    } else if (interaction.isButton()) {
      await handleButtonInteraction(client, interaction);
    } else if (interaction.isStringSelectMenu()) {
      await handleSelectMenu(client, interaction);
    }
  } catch (error) {
    discordLogger.error({ error, interactionType: interaction.type }, 'Error handling interaction');
    
    const errorMessage = 'An error occurred while processing your request.';
    
    try {
      if (interaction.isRepliable()) {
        if (interaction.replied || interaction.deferred) {
          await interaction.editReply({ content: errorMessage });
        } else {
          await interaction.reply({ content: errorMessage, ephemeral: true });
        }
      }
    } catch (replyError) {
      discordLogger.error({ replyError }, 'Failed to send error response');
    }
  }
}

async function handleSlashCommand(client: ExtendedClient, interaction: ChatInputCommandInteraction) {
  const command = client.commands.get(interaction.commandName);
  
  if (!command) {
    discordLogger.warn({ commandName: interaction.commandName }, 'Unknown slash command');
    await interaction.reply({
      content: 'Unknown command.',
      ephemeral: true
    });
    return;
  }

  discordLogger.info({
    commandName: interaction.commandName,
    userId: interaction.user.id,
    username: interaction.user.username,
    guildId: interaction.guildId
  }, 'Executing slash command');

  // Ensure user exists in our system
  await userService.createOrUpdateUser(interaction.user.id, interaction.user.username);

  await command.execute(interaction);
}

async function handleButtonInteraction(client: ExtendedClient, interaction: ButtonInteraction) {
  const customId = interaction.customId;
  
  discordLogger.info({
    customId,
    userId: interaction.user.id,
    username: interaction.user.username
  }, 'Handling button interaction');

  // Parse the custom ID to determine action
  const [action, ...params] = customId.split(':');
  
  switch (action) {
    case 'approve':
      await handleApproveButton(interaction, params[0]); // recommendationId
      break;
    case 'reject':
      await handleRejectButton(interaction, params[0]); // recommendationId
      break;
    case 'details':
      await handleDetailsButton(interaction, params[0]); // recommendationId
      break;
    case 'refresh':
      await handleRefreshButton(interaction, params[0]); // data type (lineup, waivers, etc.)
      break;
    default:
      await interaction.reply({
        content: 'Unknown button action.',
        ephemeral: true
      });
  }
}

async function handleSelectMenu(client: ExtendedClient, interaction: any) {
  discordLogger.info({
    customId: interaction.customId,
    values: interaction.values,
    userId: interaction.user.id
  }, 'Handling select menu');

  // Handle league selection or other dropdowns
  if (interaction.customId === 'select_league') {
    const selectedLeagueId = interaction.values[0];
    
    await interaction.reply({
      content: `Selected league: ${selectedLeagueId}. You can now use fantasy commands with this league.`,
      ephemeral: true
    });
    
    // Could store user's preferred league in database here
  }
}

async function handleApproveButton(interaction: ButtonInteraction, recommendationId: string) {
  const discordId = interaction.user.id;
  
  // Check authentication
  const isAuth = await userService.isAuthenticated(discordId);
  if (!isAuth) {
    await interaction.reply({
      content: '🔐 You need to be authenticated to approve recommendations.',
      ephemeral: true
    });
    return;
  }

  const yahooUserId = await userService.getYahooUserId(discordId);
  if (!yahooUserId) {
    await interaction.reply({
      content: '❌ Authentication error. Please re-authenticate.',
      ephemeral: true
    });
    return;
  }

  try {
    await interaction.deferReply({ ephemeral: true });

    const success = await orchestratorApi.approveRecommendation(yahooUserId, recommendationId);
    
    if (success) {
      await interaction.editReply({
        content: '✅ Recommendation approved and executed!'
      });
      
      discordLogger.info({ discordId, yahooUserId, recommendationId }, 'Recommendation approved');
    } else {
      await interaction.editReply({
        content: '❌ Failed to approve recommendation. It may have already been processed.'
      });
    }
  } catch (error) {
    discordLogger.error({ error, discordId, recommendationId }, 'Error approving recommendation');
    await interaction.editReply({
      content: '❌ An error occurred while approving the recommendation.'
    });
  }
}

async function handleRejectButton(interaction: ButtonInteraction, recommendationId: string) {
  const discordId = interaction.user.id;
  
  // Check authentication
  const isAuth = await userService.isAuthenticated(discordId);
  if (!isAuth) {
    await interaction.reply({
      content: '🔐 You need to be authenticated to reject recommendations.',
      ephemeral: true
    });
    return;
  }

  const yahooUserId = await userService.getYahooUserId(discordId);
  if (!yahooUserId) {
    await interaction.reply({
      content: '❌ Authentication error. Please re-authenticate.',
      ephemeral: true
    });
    return;
  }

  try {
    await interaction.deferReply({ ephemeral: true });

    const success = await orchestratorApi.rejectRecommendation(yahooUserId, recommendationId);
    
    if (success) {
      await interaction.editReply({
        content: '❌ Recommendation rejected and will not be executed.'
      });
      
      discordLogger.info({ discordId, yahooUserId, recommendationId }, 'Recommendation rejected');
    } else {
      await interaction.editReply({
        content: '❌ Failed to reject recommendation. It may have already been processed.'
      });
    }
  } catch (error) {
    discordLogger.error({ error, discordId, recommendationId }, 'Error rejecting recommendation');
    await interaction.editReply({
      content: '❌ An error occurred while rejecting the recommendation.'
    });
  }
}

async function handleDetailsButton(interaction: ButtonInteraction, recommendationId: string) {
  const discordId = interaction.user.id;
  
  // Check authentication
  const isAuth = await userService.isAuthenticated(discordId);
  if (!isAuth) {
    await interaction.reply({
      content: '🔐 You need to be authenticated to view recommendation details.',
      ephemeral: true
    });
    return;
  }

  const yahooUserId = await userService.getYahooUserId(discordId);
  if (!yahooUserId) {
    await interaction.reply({
      content: '❌ Authentication error. Please re-authenticate.',
      ephemeral: true
    });
    return;
  }

  try {
    await interaction.deferReply({ ephemeral: true });

    // Get user's leagues to find the recommendation
    const leagues = await orchestratorApi.getUserLeagues(yahooUserId);
    let recommendationDetails = null;
    
    for (const league of leagues) {
      const pending = await orchestratorApi.getPendingApprovals(yahooUserId, league.id);
      recommendationDetails = pending.find(p => p.id === recommendationId);
      if (recommendationDetails) break;
    }

    if (!recommendationDetails) {
      await interaction.editReply({
        content: '❌ Recommendation not found. It may have already been processed.'
      });
      return;
    }

    // Create detailed embed
    const embed = new EmbedBuilder()
      .setTitle('📋 Recommendation Details')
      .setColor(0x430297);

    let description = `**Type:** ${recommendationDetails.type}\n`;
    description += `**Confidence:** ${Math.round(recommendationDetails.confidence * 100)}%\n`;
    description += `**Created:** ${new Date(recommendationDetails.created_at).toLocaleString()}\n\n`;
    
    if (recommendationDetails.reason) {
      description += `**Analysis:**\n${recommendationDetails.reason}\n\n`;
    }

    if (recommendationDetails.data) {
      description += `**Action Details:**\n`;
      if (recommendationDetails.type === 'LINEUP_SWAP') {
        description += `• Start: ${recommendationDetails.data.in?.player_name} (${recommendationDetails.data.in?.position})\n`;
        description += `• Bench: ${recommendationDetails.data.out?.player_name} (${recommendationDetails.data.out?.position})\n`;
        if (recommendationDetails.data.projected_improvement) {
          description += `• Expected improvement: +${recommendationDetails.data.projected_improvement} points\n`;
        }
      } else if (recommendationDetails.type === 'WAIVER_CLAIM') {
        description += `• Add: ${recommendationDetails.data.add?.player_name} (${recommendationDetails.data.add?.position})\n`;
        description += `• Drop: ${recommendationDetails.data.drop?.player_name} (${recommendationDetails.data.drop?.position})\n`;
        if (recommendationDetails.data.fab_bid) {
          description += `• FAB Bid: $${recommendationDetails.data.fab_bid}\n`;
        }
        if (recommendationDetails.data.priority) {
          description += `• Waiver Priority: ${recommendationDetails.data.priority}\n`;
        }
      }
    }

    embed.setDescription(description);

    // Add additional context if available
    if (recommendationDetails.context) {
      let contextText = '';
      if (recommendationDetails.context.injury_risk) {
        contextText += `🏥 Injury Considerations: ${recommendationDetails.context.injury_risk}\n`;
      }
      if (recommendationDetails.context.matchup_analysis) {
        contextText += `⚔️ Matchup: ${recommendationDetails.context.matchup_analysis}\n`;
      }
      if (recommendationDetails.context.weather_impact) {
        contextText += `🌤️ Weather: ${recommendationDetails.context.weather_impact}\n`;
      }
      
      if (contextText) {
        embed.addFields({
          name: '🔍 Additional Context',
          value: contextText,
          inline: false
        });
      }
    }

    // Add risk assessment if available
    if (recommendationDetails.risk_factors) {
      const riskText = recommendationDetails.risk_factors.join('\n• ');
      embed.addFields({
        name: '⚠️ Risk Factors',
        value: '• ' + riskText,
        inline: false
      });
    }

    embed.setFooter({
      text: `Recommendation ID: ${recommendationId}`
    });

    await interaction.editReply({
      embeds: [embed]
    });

    discordLogger.info({ discordId, yahooUserId, recommendationId }, 'Displayed recommendation details');

  } catch (error) {
    discordLogger.error({ error, discordId, recommendationId }, 'Error getting recommendation details');
    await interaction.editReply({
      content: '❌ An error occurred while getting recommendation details.'
    });
  }
}

async function handleRefreshButton(interaction: ButtonInteraction, dataType: string) {
  await interaction.reply({
    content: `🔄 Refreshing ${dataType} data...`,
    ephemeral: true
  });

  // Could trigger a refresh of the original command here
  // For now, just acknowledge the button press
}