import { Client, GatewayIntentBits, Partials, Collection } from 'discord.js';
import { ExtendedClient, BotCommand, BotButton } from './types/discord';
import { env, discordConfig } from './utils/config';
import { discordLogger } from './utils/logger';
import { oauthServer } from './services/oauthServer';
import { loadCommands } from './handlers/commands';
import { handleInteraction } from './handlers/interactions';
import { handleMessage } from './handlers/messages';
import { initializeScheduler } from './services/scheduler';
import { startHealthServer } from './healthServer';

// Create Discord client with extended properties
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [
    Partials.Channel,
    Partials.Message,
  ],
}) as ExtendedClient;

// Initialize command and button collections
client.commands = new Collection<string, BotCommand>();
client.buttons = new Collection<string, BotButton>();

async function initializeBot() {
  console.log('🚀 Starting Discord bot initialization...');
  
  try {
    // Start lightweight HTTP server for platform healthchecks FIRST
    console.log('🏥 Starting health server...');
    startHealthServer();
    console.log('✅ Health server started successfully');

    // Start OAuth callback server
    console.log('🔐 Starting OAuth callback server...');
    try {
      await oauthServer.start();
      console.log('✅ OAuth callback server started');
      discordLogger.info('OAuth callback server started');
    } catch (error) {
      console.warn('⚠️ Failed to start OAuth server:', error);
      discordLogger.warn({ error }, 'Failed to start OAuth server - authentication may not work properly');
    }

    // Load commands
    console.log('📋 Loading Discord commands...');
    const commands = loadCommands();
    client.commands = commands;
    console.log(`✅ Loaded ${commands.size} slash commands`);
    discordLogger.info(`Loaded ${commands.size} slash commands`);

    // Register event handlers
    console.log('🔧 Registering event handlers...');
    registerEventHandlers();

    // Login to Discord (if token present)
    if (!env.DISCORD_TOKEN) {
      console.warn('⚠️ DISCORD_TOKEN is not set. Skipping Discord login; health endpoint will remain up.');
      discordLogger.warn('DISCORD_TOKEN is not set. Skipping Discord login; health endpoint will remain up.');
      return;
    }
    
    console.log('🤖 Connecting to Discord...');
    await client.login(env.DISCORD_TOKEN);
    console.log('✅ Discord bot connected successfully');
    
  } catch (error) {
    // Do not exit the process so health endpoint stays up
    console.error('❌ Failed to initialize bot; keeping process alive for healthchecks:', error);
    discordLogger.error(error, 'Failed to initialize bot; keeping process alive for healthchecks');
  }
}

function registerEventHandlers() {
  // Ready event
  client.once('clientReady', async () => {
    if (!client.user) return;
    
    discordLogger.info({
      username: client.user.username,
      id: client.user.id,
      guilds: client.guilds.cache.size
    }, 'Discord bot is ready');

    // Set bot status
    client.user.setPresence({
      status: 'online',
      activities: [{
        name: 'Fantasy Football | /help',
        type: 3, // WATCHING
      }],
    });

    // Commands are registered separately via deploy-commands script
    discordLogger.info('Bot ready - commands should be deployed via deploy-commands script');

    // Initialize scheduler for proactive notifications
    const scheduler = initializeScheduler(client);
    await scheduler.initialize();
  });

  // Interaction handler (slash commands, buttons, etc.)
  client.on('interactionCreate', async (interaction) => {
    await handleInteraction(client, interaction);
  });

  // Message handler for natural language processing
  client.on('messageCreate', async (message) => {
    await handleMessage(client, message);
  });

  // Error handlers
  client.on('error', (error) => {
    discordLogger.error(error, 'Discord client error');
  });

  client.on('warn', (warning) => {
    discordLogger.warn({ warning }, 'Discord client warning');
  });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    discordLogger.info('Received SIGINT, shutting down gracefully...');
    await cleanup();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    discordLogger.info('Received SIGTERM, shutting down gracefully...');
    await cleanup();
    process.exit(0);
  });
}


async function cleanup() {
  try {
    discordLogger.info('Cleaning up resources...');
    
    // Stop OAuth server
    try {
      await oauthServer.stop();
      discordLogger.info('OAuth server stopped');
    } catch (error) {
      discordLogger.warn({ error }, 'Error stopping OAuth server');
    }
    
    // Cleanup scheduler
    const { schedulerService } = await import('./services/scheduler');
    if (schedulerService) {
      schedulerService.destroy();
    }
    
    // Destroy Discord client
    client.destroy();
    
    discordLogger.info('Cleanup completed');
  } catch (error) {
    discordLogger.error(error, 'Error during cleanup');
  }
}

// Start the bot
if (require.main === module) {
  initializeBot();
}

export default client;
