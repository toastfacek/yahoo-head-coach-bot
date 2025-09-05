import { Client, GatewayIntentBits, Partials, Collection } from 'discord.js';
import { ExtendedClient, BotCommand, BotButton } from './types/discord';
import { env, discordConfig } from './utils/config';
import { discordLogger } from './utils/logger';
import { orchestratorApi } from './services/orchestratorApi';
import { userService } from './services/userService';
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
  // CRITICAL: Start health server first, before anything else can fail
  console.log('🚀 Starting Discord bot initialization...');
  const healthServer = startHealthServer();
  
  if (!healthServer) {
    console.error('❌ Health server failed to start - this will cause deployment issues');
  }

  try {
    // Load commands
    const commands = loadCommands();
    client.commands = commands;
    
    discordLogger.info(`Loaded ${commands.size} slash commands`);

    // Check orchestrator health
    const isHealthy = await orchestratorApi.healthCheck();
    if (!isHealthy) {
      discordLogger.warn('Orchestrator API health check failed - some features may not work');
    } else {
      discordLogger.info('Orchestrator API is healthy');
    }

    // Register event handlers
    registerEventHandlers();

    // Login to Discord (if token present)
    if (!env.DISCORD_TOKEN) {
      discordLogger.warn('DISCORD_TOKEN is not set. Skipping Discord login; health endpoint will remain up.');
      console.log('⚠️ Discord login skipped - health endpoint should still be accessible');
      return;
    }
    await client.login(env.DISCORD_TOKEN);
    
  } catch (error) {
    // Do not exit the process so health endpoint stays up
    discordLogger.error(error, 'Failed to initialize bot; keeping process alive for healthchecks');
    console.error('❌ Bot initialization failed, but health endpoint should still work');
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
    
    // Cleanup scheduler
    const { schedulerService } = await import('./services/scheduler');
    if (schedulerService) {
      schedulerService.destroy();
    }
    
    // Cleanup user service
    await userService.cleanup();
    
    // Destroy Discord client
    client.destroy();
    
    discordLogger.info('Cleanup completed');
  } catch (error) {
    discordLogger.error(error, 'Error during cleanup');
  }
}

// Debug environment for Railway deployment
console.log('🌍 Environment debug:', {
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  DISCORD_HEALTH_PORT: process.env.DISCORD_HEALTH_PORT,
  SERVICE: process.env.SERVICE,
  hasDiscordToken: !!process.env.DISCORD_TOKEN,
  hasOrchestratorUrl: !!process.env.ORCHESTRATOR_URL,
  hasDatabaseUrl: !!process.env.DATABASE_URL
});

// Start the bot
if (require.main === module) {
  initializeBot();
}

export default client;
