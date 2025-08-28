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
  try {
    // Start lightweight HTTP server for platform healthchecks
    startHealthServer();

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

    // Login to Discord
    await client.login(env.DISCORD_TOKEN);
    
  } catch (error) {
    discordLogger.error(error, 'Failed to initialize bot');
    process.exit(1);
  }
}

function registerEventHandlers() {
  // Ready event
  client.once('ready', async () => {
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

    // Register slash commands globally
    await registerSlashCommands();

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

async function registerSlashCommands() {
  try {
    const commandData = Array.from(client.commands.values()).map(cmd => cmd.data.toJSON());
    
    if (!client.application) {
      discordLogger.error('Client application not available for command registration');
      return;
    }

    // Register commands globally (takes up to 1 hour to propagate)
    // For development, you might want to register to a specific guild for instant updates
    await client.application.commands.set(commandData);
    
    discordLogger.info(`Registered ${commandData.length} global slash commands`);
  } catch (error) {
    discordLogger.error(error, 'Failed to register slash commands');
  }
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

// Start the bot
if (require.main === module) {
  initializeBot();
}

export default client;
