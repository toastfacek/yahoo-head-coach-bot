import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { BotCommand } from '../types/discord';
import { orchestratorApi } from '../services/orchestratorApi';
import { userService } from '../services/userService';
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

async function generateFallbackAuthUrl(discordId: string): Promise<string> {
  // Fallback OAuth URL generation when orchestrator is unavailable
  // This uses a simple state token that the orchestrator can handle
  const yahooClientId = process.env.YAHOO_CLIENT_ID;
  const redirectUri = process.env.YAHOO_REDIRECT_URI;
  
  if (!yahooClientId || !redirectUri) {
    throw new Error('Yahoo OAuth configuration missing (YAHOO_CLIENT_ID or YAHOO_REDIRECT_URI)');
  }
  
  // Create a simple state token that includes the Discord ID and timestamp
  // This is a temporary fallback - the orchestrator will need to handle this format
  const fallbackState = Buffer.from(JSON.stringify({ 
    discordId, 
    timestamp: Date.now(),
    fallback: true 
  })).toString('base64url');
  
  const authUrl = `https://api.login.yahoo.com/oauth2/request_auth?` +
    `client_id=${encodeURIComponent(yahooClientId)}&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
    `response_type=code&` +
    `scope=fspt-w&` +
    `state=${encodeURIComponent(fallbackState)}`;
  
  return authUrl;
}

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

    // Check orchestrator health first
    authLogger.info({ discordId }, 'Checking orchestrator health before OAuth session creation');
    const isHealthy = await orchestratorApi.healthCheck();
    
    let authUrl: string;
    
    if (isHealthy) {
      // Use orchestrator to create proper OAuth session with JWT state
      authLogger.info({ discordId }, 'Creating OAuth session via orchestrator');
      try {
        authUrl = await orchestratorApi.createOAuthSession(discordId);
        authLogger.info({ discordId, authUrlGenerated: !!authUrl }, 'OAuth session created successfully');
      } catch (sessionError) {
        authLogger.error({ error: sessionError, discordId }, 'Failed to create OAuth session via orchestrator, falling back to direct URL');
        authUrl = await generateFallbackAuthUrl(discordId);
      }
    } else {
      // Fallback: Generate OAuth URL directly (will need manual state validation fix)
      authLogger.warn({ discordId }, 'Orchestrator health check failed, using fallback OAuth URL generation');
      authUrl = await generateFallbackAuthUrl(discordId);
    }
    
    const embed = new EmbedBuilder()
      .setTitle('Connect Yahoo Fantasy Football')
      .setDescription(`Authorize the bot to access your Yahoo Fantasy data. You can revoke access at any time in Yahoo settings.
      
⏰ **Important:** Click the link immediately and complete the process within 1-2 minutes to avoid authorization expiration.`)
      .setColor(0x430297);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setLabel('Authorize with Yahoo').setStyle(ButtonStyle.Link).setURL(authUrl),
      new ButtonBuilder().setCustomId('auth:status').setLabel('Check Status').setStyle(ButtonStyle.Secondary)
    );

    const payload = { embeds: [embed], components: [row] } as const;

    // Since we deferred, always use editReply
    await interaction.editReply(payload as any);

    // Background user sync (no additional messages)
    userService
      .createOrUpdateUser(discordId, discordUsername)
      .catch((err) => authLogger.warn({ err, discordId }, 'User upsert failed post-link display'));
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

    // Ensure user exists in our system (happens quickly in background)
    userService.createOrUpdateUser(discordId, discordUsername).catch(error => {
      authLogger.warn({ error, discordId }, 'User creation failed but continuing with status check');
    });

    const user = await userService.getUser(discordId);
    const isAuth = await userService.isAuthenticated(discordId);

    let statusDescription: string;
    let statusColor: number;

    if (isAuth && user?.yahooUserId) {
      // Double-check with orchestrator using Discord ID
      const oauthStatus = await orchestratorApi.checkOAuthStatus(discordId);
      
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

    // Ensure user exists in our system (happens quickly in background)
    userService.createOrUpdateUser(discordId, discordUsername).catch(error => {
      authLogger.warn({ error, discordId }, 'User creation failed but continuing with logout');
    });

    const isAuth = await userService.isAuthenticated(discordId);
    
    if (!isAuth) {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: 'ℹ️ You are not currently authenticated with Yahoo Fantasy Football.' });
      } else {
        await interaction.reply({ content: 'ℹ️ You are not currently authenticated with Yahoo Fantasy Football.', flags: MessageFlags.Ephemeral });
      }
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

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ embeds: [embed] });
    } else {
      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    authLogger.info({ discordId }, 'User disconnected Yahoo account');
  } catch (error) {
    authLogger.error({ error, discordId }, 'Failed to logout user');
    throw error; // Let main handler deal with responses
  }
}
