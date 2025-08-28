#!/usr/bin/env ts-node
import { REST, Routes } from 'discord.js';
import { env } from '../utils/config';
import { loadCommands } from '../handlers/commands';
import { discordLogger } from '../utils/logger';

async function deployCommands() {
  try {
    const commands = loadCommands();
    const commandData = Array.from(commands.values()).map(cmd => cmd.data.toJSON());
    
    discordLogger.info(`Deploying ${commandData.length} commands...`);

    const rest = new REST({ version: '10' }).setToken(env.DISCORD_TOKEN);

    // Deploy commands globally
    await rest.put(
      Routes.applicationCommands(env.DISCORD_CLIENT_ID),
      { body: commandData }
    );

    discordLogger.info(`Successfully deployed ${commandData.length} global commands!`);
    
    // List deployed commands
    commandData.forEach(cmd => {
      discordLogger.info(`- /${cmd.name}: ${cmd.description}`);
    });

  } catch (error) {
    discordLogger.error(error, 'Failed to deploy commands');
    process.exit(1);
  }
}

if (require.main === module) {
  deployCommands();
}