import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { BotCommand } from '../types/discord';
import { yahooAuth } from '../services/yahooAuth';
import { yahooApi } from '../services/yahooApi';
import { authLogger } from '../utils/logger';
import { env } from '../utils/config';

export const authCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('auth')
    .setDescription('Authenticate with Yahoo Fantasy Football')
    .addSubcommand(subcommand =>
      subcommand
        .setName('login')
        .setDescription('Get Yahoo authentication link')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('status')
        .setDescription('Check your authentication status')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('logout')
        .setDescription('Disconnect your Yahoo account')
    ) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction) {
    const executionId = Math.random().toString(36).substring(7);
    const subcommand = interaction.options.getSubcommand();
    const discordId = interaction.user.id;
    const discordUsername = interaction.user.username;

    authLogger.info({ discordId, executionId, subcommand, interactionId: interaction.id }, 'ULTRATHINK: Auth command execute started');

    try {
      // Route by subcommand; each handler will safely ack/edit
      switch (subcommand) {
        case 'login':
          await handleLogin(interaction, discordId, discordUsername);
          break;
        case 'status':
          await handleStatus(interaction, discordId, discordUsername);
          break;
        case 'logout':
          await handleLogout(interaction, discordId, discordUsername);
          break;
        default:
          await interaction.reply({
            content: 'Unknown auth command. Use `/auth login`, `/auth status`, or `/auth logout`.',
            flags: MessageFlags.Ephemeral,
          });
      }
    } catch (error) {
      authLogger.error({ error, discordId, subcommand }, 'Auth command error');
      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({ content: 'An error occurred while processing your authentication request.' });
        } else {
          await interaction.reply({ content: 'An error occurred while processing your authentication request.', flags: MessageFlags.Ephemeral });
        }
      } catch (replyError) {
        authLogger.error({ replyError, discordId, subcommand }, 'Failed to send error response');
      }
    }
  },
};

// This function is no longer needed as we handle OAuth directly

async function handleLogin(
  interaction: ChatInputCommandInteraction,
  discordId: string,
  discordUsername: string
) {
  try {
    // Defer the reply since we might need time to process
    if (!interaction.replied && !interaction.deferred) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    }

    // Generate OAuth URL directly using our new auth service
    authLogger.info({ discordId }, 'Generating OAuth URL for Discord user');
    const authUrl = yahooAuth.generateAuthUrl(discordId);
    
    const embed = new EmbedBuilder()
      .setTitle('🏈 Connect Yahoo Fantasy Football')
      .setDescription(
        '**Authorize HeadCoach to access your Yahoo Fantasy data**\n\n' +
        '• Click the button below to connect your Yahoo account\n' +
        '• You\'ll be redirected to Yahoo for secure login\n' +
        '• After authorization, return here and check your status\n\n' +
        '*You can revoke access anytime in your Yahoo account settings*'
      )
      .setColor(0x430297);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel('🔗 Authorize with Yahoo')
        .setStyle(ButtonStyle.Link)
        .setURL(authUrl),
      new ButtonBuilder()
        .setCustomId('auth:status')
        .setLabel('📊 Check Status')
        .setStyle(ButtonStyle.Secondary)
    );

    // Since we deferred, always use editReply
    await interaction.editReply({ 
      embeds: [embed], 
      components: [row] 
    });

    authLogger.info({ discordId }, 'Auth URL generated and sent to user');
  } catch (error) {
    authLogger.error({ error, discordId }, 'Failed to generate auth URL');
    const errorMessage = '❌ Failed to generate authentication link. Please try again later.';
    
    if (interaction.deferred) {
      await interaction.editReply({ content: errorMessage }).catch(() => {});
    } else if (!interaction.replied) {
      await interaction.reply({
        content: errorMessage,
        flags: MessageFlags.Ephemeral,
      }).catch(() => {});
    }
  }
}

async function handleStatus(interaction: ChatInputCommandInteraction, discordId: string, discordUsername: string) {
  try {
    // Safely ack
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
    }

    // Check authentication status using our new auth service
    const isAuth = await yahooAuth.isAuthenticated(discordId);
    const token = await yahooAuth.getToken(discordId);

    let statusDescription: string;
    let statusColor: number;

    if (isAuth && token) {
      // Try to get user's leagues to verify the connection works
      const leaguesResult = await yahooApi.getUserLeagues(discordId);
      
      if (leaguesResult.success && leaguesResult.data) {
        const leagueCount = leaguesResult.data.length;
        statusDescription = 
          '✅ **Connected to Yahoo Fantasy Football**\n\n' +
          `**Status:** Active and working\n` +
          `**Leagues Found:** ${leagueCount} league${leagueCount !== 1 ? 's' : ''}\n` +
          `**Connected:** ${token.createdAt.toLocaleDateString()}\n` +
          `**Token Expires:** ${token.expiresAt.toLocaleDateString()}\n\n` +
          'You can now use fantasy football commands like `/leagues`, `/standings`, and `/roster`!';
        statusColor = 0x00ff00;
      } else {
        statusDescription = 
          '⚠️ **Connection Issues**\n\n' +
          'Your Yahoo connection exists but there may be an issue accessing your data.\n' +
          'Try using `/auth logout` and then `/auth login` to reconnect.';
        statusColor = 0xff9900;
      }
    } else {
      statusDescription = 
        '❌ **Not Connected**\n\n' +
        'You haven\'t connected your Yahoo Fantasy Football account yet.\n\n' +
        '**To get started:**\n' +
        '1️⃣ Use `/auth login` to connect your account\n' +
        '2️⃣ Authorize HeadCoach in your browser\n' +
        '3️⃣ Return here and use `/auth status` to verify\n\n' +
        '*Then try commands like `/leagues` to see your fantasy teams!*';
      statusColor = 0xff0000;
    }

    const embed = new EmbedBuilder()
      .setTitle('🔐 Authentication Status')
      .setDescription(statusDescription)
      .setColor(statusColor);

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ embeds: [embed] });
    } else {
      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  } catch (error) {
    authLogger.error({ error, discordId }, 'Failed to check auth status');
    throw error; // Let main handler deal with responses
  }
}

async function handleLogout(interaction: ChatInputCommandInteraction, discordId: string, discordUsername: string) {
  try {
    // Safely ack
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
    }

    const isAuth = await yahooAuth.isAuthenticated(discordId);
    
    if (!isAuth) {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: 'ℹ️ You are not currently authenticated with Yahoo Fantasy Football.' });
      } else {
        await interaction.reply({ content: 'ℹ️ You are not currently authenticated with Yahoo Fantasy Football.', flags: MessageFlags.Ephemeral });
      }
      return;
    }

    // Remove the stored token and clear cache
    const success = await yahooAuth.removeToken(discordId);
    yahooApi.clearUserCache(discordId);

    if (success) {
      const embed = new EmbedBuilder()
        .setTitle('🔓 Account Disconnected')
        .setDescription(
          '✅ **Your Yahoo Fantasy Football account has been disconnected.**\n\n' +
          '• All stored authentication tokens have been removed\n' +
          '• Your cached data has been cleared\n' +
          '• Fantasy commands will no longer work until you reconnect\n\n' +
          '*Use `/auth login` whenever you want to reconnect your account.*'
        )
        .setColor(0x808080);

      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ embeds: [embed] });
      } else {
        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      authLogger.info({ discordId }, 'User successfully disconnected Yahoo account');
    } else {
      throw new Error('Failed to remove authentication token');
    }
  } catch (error) {
    authLogger.error({ error, discordId }, 'Failed to logout user');
    throw error; // Let main handler deal with responses
  }
}
