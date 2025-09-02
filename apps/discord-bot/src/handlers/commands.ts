import { Collection } from 'discord.js';
import { BotCommand } from '../types/discord';
import { authCommand } from '../commands/auth';
import { lineupCommand } from '../commands/lineup';
import { waiversCommand } from '../commands/waivers';
import { reportCommand } from '../commands/report';
import { approvalsCommand } from '../commands/approvals';
import { listCommand } from '../commands/list';

export function loadCommands(): Collection<string, BotCommand> {
  const commands = new Collection<string, BotCommand>();
  
  // Register all slash commands
  commands.set(authCommand.data.name, authCommand);
  commands.set(lineupCommand.data.name, lineupCommand);
  commands.set(waiversCommand.data.name, waiversCommand);
  commands.set(reportCommand.data.name, reportCommand);
  commands.set(approvalsCommand.data.name, approvalsCommand);
  commands.set(listCommand.data.name, listCommand);

  return commands;
}
