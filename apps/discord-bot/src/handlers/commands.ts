import { Collection } from 'discord.js';
import { BotCommand } from '../types/discord';
import { authCommand } from '../commands/auth';
import { lineupCommand } from '../commands/lineup';
import { waiversCommand } from '../commands/waivers';
import { reportCommand } from '../commands/report';
import { approvalsCommand } from '../commands/approvals';
import { listCommand } from '../commands/list';
import { leaguesCommand } from '../commands/leagues';
import { standingsCommand } from '../commands/standings';
import { myteamCommand } from '../commands/myteam';
import { playerCommand } from '../commands/player';
import { matchupsCommand } from '../commands/matchups';

export function loadCommands(): Collection<string, BotCommand> {
  const commands = new Collection<string, BotCommand>();
  
  // Register all slash commands
  commands.set(authCommand.data.name, authCommand);
  commands.set(lineupCommand.data.name, lineupCommand);
  commands.set(waiversCommand.data.name, waiversCommand);
  commands.set(reportCommand.data.name, reportCommand);
  commands.set(approvalsCommand.data.name, approvalsCommand);
  commands.set(listCommand.data.name, listCommand);
  
  // New Yahoo API direct commands
  commands.set(leaguesCommand.data.name, leaguesCommand);
  commands.set(standingsCommand.data.name, standingsCommand);
  commands.set(myteamCommand.data.name, myteamCommand);
  commands.set(playerCommand.data.name, playerCommand);
  commands.set(matchupsCommand.data.name, matchupsCommand);

  return commands;
}
