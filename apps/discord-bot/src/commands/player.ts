import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, MessageFlags, AutocompleteInteraction } from 'discord.js';
import { BotCommand } from '../types/discord';
import { yahooAuth } from '../services/yahooAuth';
import { yahooApi } from '../services/yahooApi';
import { authLogger } from '../utils/logger';

// Common NFL stat ID mappings from Yahoo API
const STAT_MAPPINGS: { [key: string]: string } = {
  '1': 'Passing Attempts',
  '2': 'Passing Completions', 
  '4': 'Passing Yards',
  '5': 'Passing TDs',
  '6': 'Interceptions',
  '8': 'Fumbles Lost',
  '9': 'Times Sacked',
  '10': 'Rushing Attempts',
  '11': 'Rushing Yards',
  '12': 'Rushing TDs',
  '13': 'Receptions',
  '14': 'Receiving Yards',
  '15': 'Receiving TDs',
  '16': 'Return TDs',
  '18': '2-Point Conversions',
  '57': 'Offensive Fumble Return TD',
  '68': 'Points',
  // Add more as needed
};

export const playerCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('player')
    .setDescription('Get detailed player information and stats')
    .addStringOption(option =>
      option
        .setName('name')
        .setDescription('Player name to search for')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption(option =>
      option
        .setName('league')
        .setDescription('League ID or name (leave empty to search all leagues)')
        .setRequired(false)
    )
    .addIntegerOption(option =>
      option
        .setName('week')
        .setDescription('Specific week number for stats (leave empty for season stats)')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(18)
    ),

  async autocomplete(interaction: AutocompleteInteraction) {
    const discordId = interaction.user.id;
    const focusedOption = interaction.options.getFocused(true);
    
    if (focusedOption.name === 'name') {
      const searchTerm = focusedOption.value as string;
      
      if (!searchTerm || searchTerm.length < 2) {
        await interaction.respond([]);
        return;
      }

      try {
        // Check if user is authenticated
        const isAuth = await yahooAuth.isAuthenticated(discordId);
        if (!isAuth) {
          await interaction.respond([
            { name: 'You must authenticate first (/auth login)', value: 'auth_required' }
          ]);
          return;
        }

        // Search for players
        const searchResult = await yahooApi.searchPlayers(discordId, searchTerm);
        
        if (!searchResult.success || !searchResult.data) {
          await interaction.respond([
            { name: 'Search failed - try again', value: 'search_failed' }
          ]);
          return;
        }

        // Format results for autocomplete (limit to 25 as per Discord limit)
        const choices = searchResult.data.slice(0, 25).map(player => ({
          name: `${player.name} (${player.position} - ${player.team})`,
          value: player.playerId
        }));

        await interaction.respond(choices);
        
      } catch (error) {
        authLogger.error({ error, discordId }, 'Player autocomplete error');
        await interaction.respond([
          { name: 'Error searching players', value: 'error' }
        ]);
      }
    }
  },

  async execute(interaction: ChatInputCommandInteraction) {
    const discordId = interaction.user.id;
    const executionId = Math.random().toString(36).substring(7);
    const playerKey = interaction.options.getString('name', true);
    const leagueInput = interaction.options.getString('league');
    const week = interaction.options.getInteger('week');

    authLogger.info({ discordId, executionId, playerKey, leagueInput, week }, 'Player command started');

    try {
      // Handle special autocomplete values
      if (playerKey === 'auth_required') {
        const embed = new EmbedBuilder()
          .setTitle('🔒 Authentication Required')
          .setDescription('You need to authenticate first using `/auth login`')
          .setColor(0xff0000);
        
        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        return;
      }

      if (playerKey === 'search_failed' || playerKey === 'error') {
        const embed = new EmbedBuilder()
          .setTitle('❌ Search Error')
          .setDescription('There was an error searching for players. Please try again.')
          .setColor(0xff0000);
        
        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        return;
      }

      // Defer the reply since we'll be making API calls
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      // Check authentication first
      const isAuthenticated = await yahooAuth.isAuthenticated(discordId);
      if (!isAuthenticated) {
        const embed = new EmbedBuilder()
          .setTitle('🔒 Authentication Required')
          .setDescription('You need to connect your Yahoo Fantasy Football account first.\n\nUse `/auth login` to get started!')
          .setColor(0xff0000);

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Determine league context if provided
      let targetLeagueKey: string | undefined;
      if (leagueInput) {
        const leaguesResult = await yahooApi.getUserLeagues(discordId);
        if (leaguesResult.success && leaguesResult.data) {
          const targetLeague = leaguesResult.data.find(league => 
            league.id === leagueInput || 
            league.name.toLowerCase().includes(leagueInput.toLowerCase())
          );
          
          if (targetLeague) {
            targetLeagueKey = targetLeague.leagueKey;
          } else {
            const embed = new EmbedBuilder()
              .setTitle('❌ League Not Found')
              .setDescription(`Could not find a league matching "${leagueInput}"\n\nUse \`/leagues\` to see your available leagues.`)
              .setColor(0xff0000);

            await interaction.editReply({ embeds: [embed] });
            return;
          }
        }
      }

      // Get detailed player information
      authLogger.info({ discordId, playerKey, targetLeagueKey, week }, 'Fetching player details');
      const playerResult = await yahooApi.getPlayerDetails(discordId, playerKey, targetLeagueKey, week);

      if (!playerResult.success || !playerResult.data) {
        authLogger.error({ discordId, error: playerResult.error, playerKey }, 'Failed to fetch player details');
        
        const embed = new EmbedBuilder()
          .setTitle('❌ Player Not Found')
          .setDescription(
            `Could not find detailed information for the selected player.\n\n` +
            `Error: ${playerResult.error}\n\n` +
            'This might be a temporary issue. Please try again.'
          )
          .setColor(0xff0000);

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      const player = playerResult.data;

      // Create rich player embed
      const embed = new EmbedBuilder()
        .setTitle(`${player.name?.full || 'Unknown Player'}`)
        .setColor(0x00ff00);

      // Add player image if available
      if (player.imageUrl) {
        embed.setThumbnail(player.imageUrl);
      }

      // Basic player info
      if (player.uniformNumber) {
        embed.setDescription(`#${player.uniformNumber}`);
      }

      embed.addFields(
        { name: '🏈 Position', value: player.position || 'N/A', inline: true },
        { name: '🏟️ Team', value: player.team || 'N/A', inline: true }
      );

      if (player.byeWeeks?.week) {
        embed.addFields({ name: '📅 Bye Week', value: `Week ${player.byeWeeks.week}`, inline: true });
      }

      // Ownership information
      if (player.ownership) {
        let ownershipText = '';
        switch (player.ownership.type) {
          case 'team':
            ownershipText = player.ownership.teamName || 'Owned';
            break;
          case 'freeagents':
            ownershipText = 'Free Agent';
            break;
          case 'waivers':
            ownershipText = 'On Waivers';
            break;
          default:
            ownershipText = 'Unknown';
        }
        embed.addFields({ name: '👤 Owner', value: ownershipText, inline: true });
      }

      // Stats section
      if (player.stats && Object.keys(player.stats).length > 0) {
        const statsTitle = week ? `📊 Week ${week} Stats` : '📊 Season Stats';
        
        // Group stats into meaningful categories
        const importantStats = [];
        const otherStats = [];
        
        for (const [statId, value] of Object.entries(player.stats)) {
          const statName = STAT_MAPPINGS[statId] || `Stat ${statId}`;
          const statText = `**${statName}:** ${value}`;
          
          // Prioritize key fantasy stats
          if (['4', '5', '11', '12', '14', '15', '68'].includes(statId)) {
            importantStats.push(statText);
          } else if (parseFloat(value as string) !== 0) {
            otherStats.push(statText);
          }
        }

        // Add important stats first
        if (importantStats.length > 0) {
          const importantStatsText = importantStats.join('\n');
          embed.addFields({ name: statsTitle, value: importantStatsText, inline: false });
        }

        // Add other non-zero stats if there's room
        if (otherStats.length > 0 && embed.data.fields!.length < 10) {
          const otherStatsText = otherStats.slice(0, 10).join('\n');
          if (otherStatsText.length <= 1024) {
            embed.addFields({ name: '📈 Additional Stats', value: otherStatsText, inline: false });
          }
        }
      } else {
        const statsTitle = week ? `📊 Week ${week} Stats` : '📊 Season Stats';
        embed.addFields({ name: statsTitle, value: 'No stats available', inline: false });
      }

      // Footer with helpful info
      let footerText = 'Use /player with different week numbers to see weekly stats';
      if (leagueInput) {
        footerText += ` • League: ${leagueInput}`;
      }
      embed.setFooter({ text: footerText });

      await interaction.editReply({ embeds: [embed] });
      authLogger.info({ discordId, playerKey, week }, 'Successfully displayed player details');

    } catch (error: any) {
      authLogger.error({ error: error.message, discordId, executionId }, 'Player command error');
      
      try {
        const errorMessage = 'An error occurred while fetching player information. Please try again later.';
        if (interaction.deferred) {
          await interaction.editReply({ content: errorMessage });
        } else {
          await interaction.reply({ content: errorMessage, flags: MessageFlags.Ephemeral });
        }
      } catch (replyError) {
        authLogger.error({ replyError, discordId }, 'Failed to send error response for player command');
      }
    }
  }
};