import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, MessageFlags } from 'discord.js';
import { BotCommand } from '../types/discord';
import { yahooAuth } from '../services/yahooAuth';
import { yahooApi } from '../services/yahooApi';
import { authLogger } from '../utils/logger';

export const myteamCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('myteam')
    .setDescription('Show your team roster')
    .addStringOption(option =>
      option
        .setName('league')
        .setDescription('League ID or name (leave empty to auto-select if you have only one league)')
        .setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const discordId = interaction.user.id;
    const executionId = Math.random().toString(36).substring(7);
    const leagueInput = interaction.options.getString('league');

    authLogger.info({ discordId, executionId, leagueInput }, 'MyTeam command started');

    try {
      // Defer the reply since we'll be making API calls
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      // Check authentication first
      const isAuthenticated = await yahooAuth.isAuthenticated(discordId);
      if (!isAuthenticated) {
        const embed = new EmbedBuilder()
          .setTitle('🔒 Authentication Required')
          .setDescription(
            'You need to connect your Yahoo Fantasy Football account first.\n\n' +
            'Use `/auth login` to get started!'
          )
          .setColor(0xff0000);

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Get user's leagues to determine which league to use
      authLogger.info({ discordId }, 'Fetching user leagues');
      const leaguesResult = await yahooApi.getUserLeagues(discordId);

      if (!leaguesResult.success || !leaguesResult.data) {
        authLogger.error({ discordId, error: leaguesResult.error }, 'Failed to fetch leagues');
        
        const embed = new EmbedBuilder()
          .setTitle('❌ Failed to Load Leagues')
          .setDescription(
            `Error: ${leaguesResult.error}\n\n` +
            'Use `/auth status` to check your connection.'
          )
          .setColor(0xff0000);

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      const leagues = leaguesResult.data;

      if (leagues.length === 0) {
        const embed = new EmbedBuilder()
          .setTitle('📋 No Leagues Found')
          .setDescription('No leagues found. Use `/leagues` to see your available leagues.')
          .setColor(0xff9900);

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Determine which league to use
      let targetLeague;
      
      if (leagueInput) {
        // Try to find league by ID or name
        targetLeague = leagues.find(league => 
          league.id === leagueInput || 
          league.name.toLowerCase().includes(leagueInput.toLowerCase())
        );
        
        if (!targetLeague) {
          const embed = new EmbedBuilder()
            .setTitle('❌ League Not Found')
            .setDescription(
              `Could not find a league matching "${leagueInput}"\n\n` +
              'Use `/leagues` to see your available leagues.'
            )
            .setColor(0xff0000);

          await interaction.editReply({ embeds: [embed] });
          return;
        }
      } else {
        // Auto-select if only one league
        if (leagues.length === 1) {
          targetLeague = leagues[0];
        } else {
          const embed = new EmbedBuilder()
            .setTitle('🔍 Multiple Leagues Found')
            .setDescription(
              `You have **${leagues.length}** leagues. Please specify which one:\n\n` +
              leagues.map((league, index) => `${index + 1}. **${league.name}** (ID: \`${league.id}\`)`).join('\n') +
              '\n\nUse `/myteam league:[league-name-or-id]`'
            )
            .setColor(0xff9900);

          await interaction.editReply({ embeds: [embed] });
          return;
        }
      }

      // Get user's team in the league
      authLogger.info({ discordId, leagueKey: targetLeague.leagueKey }, 'Finding user team');
      const teamResult = await yahooApi.getUserTeam(discordId, targetLeague.leagueKey);

      if (!teamResult.success || !teamResult.data) {
        authLogger.error({ discordId, error: teamResult.error, leagueKey: targetLeague.leagueKey }, 'Failed to find user team');
        
        const embed = new EmbedBuilder()
          .setTitle('❌ Could Not Find Your Team')
          .setDescription(
            `Error finding your team in ${targetLeague.name}:\n${teamResult.error}\n\n` +
            'Make sure you\'re actually part of this league.'
          )
          .setColor(0xff0000);

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      const userTeam = teamResult.data;

      // Get the team roster
      authLogger.info({ discordId, teamKey: userTeam.teamKey }, 'Fetching team roster');
      const rosterResult = await yahooApi.getTeamRoster(discordId, userTeam.teamKey);

      if (!rosterResult.success || !rosterResult.data) {
        authLogger.error({ discordId, error: rosterResult.error, teamKey: userTeam.teamKey }, 'Failed to fetch roster');
        
        const embed = new EmbedBuilder()
          .setTitle('❌ Failed to Load Roster')
          .setDescription(
            `Error loading roster for ${userTeam.name}:\n${rosterResult.error}\n\n` +
            'This might be a temporary issue or the draft may not have happened yet.'
          )
          .setColor(0xff0000);

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      const roster = rosterResult.data;

      if (roster.length === 0) {
        const embed = new EmbedBuilder()
          .setTitle('📋 Empty Roster')
          .setDescription(
            `**${userTeam.name}** in ${targetLeague.name}\n\n` +
            'Your roster is currently empty. This usually means:\n' +
            '• The draft hasn\'t happened yet\n' +
            '• There\'s an issue loading player data\n\n' +
            'Check your league status on Yahoo directly.'
          )
          .setColor(0xff9900);

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Group players by position
      const positionGroups: { [key: string]: typeof roster } = {};
      roster.forEach(player => {
        const pos = player.position || 'Unknown';
        if (!positionGroups[pos]) {
          positionGroups[pos] = [];
        }
        positionGroups[pos].push(player);
      });

      // Create roster embed
      const embed = new EmbedBuilder()
        .setTitle(`👥 ${userTeam.name}`)
        .setDescription(`**League:** ${targetLeague.name}\n**Players:** ${roster.length}`)
        .setColor(0x00ff00);

      // Add players by position
      const positionOrder = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'BN', 'IR', 'IL'];
      
      for (const pos of positionOrder) {
        if (positionGroups[pos]) {
          const players = positionGroups[pos];
          const playerList = players.map(p => `**${p.name}** (${p.team})`).join('\n');
          
          embed.addFields({
            name: `${pos} (${players.length})`,
            value: playerList.length > 1024 ? playerList.substring(0, 1020) + '...' : playerList,
            inline: true
          });
        }
      }

      // Add any remaining positions not in the standard order
      Object.keys(positionGroups).forEach(pos => {
        if (!positionOrder.includes(pos)) {
          const players = positionGroups[pos];
          const playerList = players.map(p => `**${p.name}** (${p.team})`).join('\n');
          
          embed.addFields({
            name: `${pos} (${players.length})`,
            value: playerList.length > 1024 ? playerList.substring(0, 1020) + '...' : playerList,
            inline: true
          });
        }
      });

      embed.setFooter({ text: 'Use /standings to see how your team is doing in the league!' });

      await interaction.editReply({ embeds: [embed] });
      authLogger.info({ discordId, teamKey: userTeam.teamKey, playerCount: roster.length }, 'Successfully displayed team roster');

    } catch (error: any) {
      authLogger.error({ error: error.message, discordId, executionId }, 'MyTeam command error');
      
      try {
        const errorMessage = 'An error occurred while fetching your team roster. Please try again later.';
        if (interaction.deferred) {
          await interaction.editReply({ content: errorMessage });
        } else {
          await interaction.reply({ content: errorMessage, flags: MessageFlags.Ephemeral });
        }
      } catch (replyError) {
        authLogger.error({ replyError, discordId }, 'Failed to send error response for myteam command');
      }
    }
  }
};