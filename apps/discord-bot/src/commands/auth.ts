import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { BotCommand } from '../types/discord';
import { orchestratorApi } from '../services/orchestratorApi';
import { userService } from '../services/userService';
import { authLogger } from '../utils/logger';

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
    const subcommand = interaction.options.getSubcommand();
    const discordId = interaction.user.id;
    const discordUsername = interaction.user.username;

    try {
      // Ensure user exists in our system
      await userService.createOrUpdateUser(discordId, discordUsername);

      switch (subcommand) {
        case 'login':
          await handleLogin(interaction, discordId);
          break;
        case 'status':
          await handleStatus(interaction, discordId);
          break;
        case 'logout':
          await handleLogout(interaction, discordId);
          break;
        default:
          await interaction.reply({
            content: 'Unknown auth command. Use `/auth login`, `/auth status`, or `/auth logout`.',
            ephemeral: true
          });
      }
    } catch (error) {
      authLogger.error({ error, discordId, subcommand }, 'Auth command error');
      await interaction.reply({
        content: 'An error occurred while processing your authentication request.',
        ephemeral: true
      });
    }
  },
};

async function handleLogin(interaction: ChatInputCommandInteraction, discordId: string) {
  try {
    // Check if already authenticated
    const isAuth = await userService.isAuthenticated(discordId);
    if (isAuth) {
      await interaction.reply({
        content: '✅ You are already authenticated with Yahoo Fantasy Football.',
        ephemeral: true
      });
      return;
    }

    // Get OAuth URL from orchestrator
    const authUrl = await orchestratorApi.getOAuthUrl(discordId);

    const embed = new EmbedBuilder()
      .setTitle('🔐 Yahoo Fantasy Football Authentication')
      .setDescription(
        'Click the link below to connect your Yahoo Fantasy Football account:\n\n' +
        `[**Authenticate with Yahoo**](${authUrl})\n\n` +
        '**Important:**\n' +
        '• This link will redirect you to Yahoo to authorize the bot\n' +
        '• After authorization, you\'ll be redirected back and your account will be linked\n' +
        '• Use `/auth status` to check if authentication was successful'
      )
      .setColor(0x430297)
      .setFooter({
        text: 'Your privacy is protected - we only access your fantasy football data'
      });

    await interaction.reply({
      embeds: [embed],
      ephemeral: true
    });

    authLogger.info({ discordId, authUrl }, 'Provided OAuth URL to user');
  } catch (error) {
    authLogger.error({ error, discordId }, 'Failed to generate auth URL');
    await interaction.reply({
      content: '❌ Failed to generate authentication link. Please try again later.',
      ephemeral: true
    });
  }
}

async function handleStatus(interaction: ChatInputCommandInteraction, discordId: string) {
  try {
    const user = await userService.getUser(discordId);
    const isAuth = await userService.isAuthenticated(discordId);

    let statusDescription: string;
    let statusColor: number;

    if (isAuth && user?.yahooUserId) {
      // Double-check with orchestrator
      const oauthStatus = await orchestratorApi.checkOAuthStatus(user.yahooUserId);
      
      if (oauthStatus.authenticated) {
        statusDescription = 
          '✅ **Connected to Yahoo Fantasy Football**\n\n' +
          `**Account:** ${oauthStatus.userInfo?.name || 'Connected'}\n` +
          `**Yahoo ID:** \`${user.yahooUserId}\`\n` +
          `**Connected:** ${user.createdAt.toLocaleDateString()}\n\n` +
          'You can now use fantasy football commands!';
        statusColor = 0x00ff00;
      } else {
        statusDescription = 
          '⚠️ **Authentication Expired**\n\n' +
          'Your Yahoo connection has expired. Use `/auth login` to reconnect.';
        statusColor = 0xff9900;
        
        // Update our records
        await userService.unlinkYahooAccount(discordId);
      }
    } else {
      statusDescription = 
        '❌ **Not Connected**\n\n' +
        'You haven\'t connected your Yahoo Fantasy Football account yet.\n' +
        'Use `/auth login` to get started!';
      statusColor = 0xff0000;
    }

    const embed = new EmbedBuilder()
      .setTitle('🔐 Authentication Status')
      .setDescription(statusDescription)
      .setColor(statusColor);

    await interaction.reply({
      embeds: [embed],
      ephemeral: true
    });
  } catch (error) {
    authLogger.error({ error, discordId }, 'Failed to check auth status');
    await interaction.reply({
      content: '❌ Failed to check authentication status. Please try again.',
      ephemeral: true
    });
  }
}

async function handleLogout(interaction: ChatInputCommandInteraction, discordId: string) {
  try {
    const isAuth = await userService.isAuthenticated(discordId);
    
    if (!isAuth) {
      await interaction.reply({
        content: 'ℹ️ You are not currently authenticated with Yahoo Fantasy Football.',
        ephemeral: true
      });
      return;
    }

    // Unlink the account
    await userService.unlinkYahooAccount(discordId);

    const embed = new EmbedBuilder()
      .setTitle('🔓 Account Disconnected')
      .setDescription(
        '✅ Your Yahoo Fantasy Football account has been disconnected.\n\n' +
        'Your Discord account is no longer linked to Yahoo Fantasy Football.\n' +
        'Use `/auth login` if you want to reconnect later.'
      )
      .setColor(0x808080);

    await interaction.reply({
      embeds: [embed],
      ephemeral: true
    });

    authLogger.info({ discordId }, 'User disconnected Yahoo account');
  } catch (error) {
    authLogger.error({ error, discordId }, 'Failed to logout user');
    await interaction.reply({
      content: '❌ Failed to disconnect your account. Please try again.',
      ephemeral: true
    });
  }
}