import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, MessageFlags } from 'discord.js';
import { BotCommand } from '../types/discord';
import { orchestratorApi } from '../services/orchestratorApi';
import { userService } from '../services/userService';
import { discordLogger } from '../utils/logger';

export const reportCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('report')
    .setDescription('Generate daily fantasy football report')
    .addStringOption(option =>
      option
        .setName('league')
        .setDescription('League ID (optional - will use your primary league if not specified)')
        .setRequired(false)
    ) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction) {
    const discordId = interaction.user.id;
    const leagueId = interaction.options.getString('league');

    // Check authentication
    const isAuth = await userService.isAuthenticated(discordId);
    if (!isAuth) {
      await interaction.reply({
        content: '🔐 You need to authenticate first. Use `/auth login` to connect your Yahoo account.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const yahooUserId = await userService.getYahooUserId(discordId);
    if (!yahooUserId) {
      await interaction.reply({
        content: '❌ Authentication error. Please try `/auth logout` and `/auth login` again.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    try {
      await interaction.deferReply();

      // Get user's leagues if no league specified
      let targetLeagueId = leagueId;
      if (!targetLeagueId) {
        const leagues = await orchestratorApi.getUserLeagues(yahooUserId);
        if (leagues.length === 0) {
          await interaction.editReply({
            content: '❌ No fantasy leagues found for your account.'
          });
          return;
        }
        targetLeagueId = leagues[0].id; // Use first league as default
      }

      // Create initial embed
      const embed = new EmbedBuilder()
        .setTitle('📈 Daily Fantasy Report')
        .setDescription('🔄 Generating your personalized fantasy football report...')
        .setColor(0x430297);

      const message = await interaction.editReply({
        embeds: [embed]
      });

      // Stream the daily report
      let reportContent = '';
      let currentSection = '';
      
      try {
        for await (const chunk of await orchestratorApi.getDailyReport(yahooUserId, targetLeagueId!)) {
          reportContent += chunk;
          
          // Update the embed periodically with streaming content
          if (reportContent.length > 50) { // Update every ~50 characters
            const sections = parseReportContent(reportContent);
            
            const updatedEmbed = new EmbedBuilder()
              .setTitle('📈 Daily Fantasy Report')
              .setColor(0x430297);

            // Add sections to embed
            sections.forEach(section => {
              if (section.content.trim()) {
                updatedEmbed.addFields({
                  name: section.title,
                  value: section.content.length > 1024 ? section.content.substring(0, 1021) + '...' : section.content,
                  inline: false
                });
              }
            });

            if (sections.length === 0) {
              updatedEmbed.setDescription('🔄 Generating report...\n\n' + reportContent.substring(-200));
            }

            updatedEmbed.setFooter({
              text: `League: ${targetLeagueId} • Generated: ${new Date().toLocaleString()}`
            });

            try {
              await interaction.editReply({
                embeds: [updatedEmbed]
              });
            } catch (editError) {
              // Ignore edit rate limit errors
            }
          }
        }

        // Final update with complete report
        const sections = parseReportContent(reportContent);
        
        const finalEmbed = new EmbedBuilder()
          .setTitle('📈 Daily Fantasy Report')
          .setColor(0x00ff00);

        sections.forEach(section => {
          if (section.content.trim()) {
            finalEmbed.addFields({
              name: section.title,
              value: section.content.length > 1024 ? section.content.substring(0, 1021) + '...' : section.content,
              inline: false
            });
          }
        });

        if (sections.length === 0 && reportContent.trim()) {
          finalEmbed.setDescription(reportContent.length > 2048 ? reportContent.substring(0, 2045) + '...' : reportContent);
        }

        finalEmbed.setFooter({
          text: `League: ${targetLeagueId} • Generated: ${new Date().toLocaleString()}`
        });

        await interaction.editReply({
          embeds: [finalEmbed]
        });

      } catch (streamError) {
        discordLogger.error({ streamError, discordId }, 'Error streaming daily report');
        
        const errorEmbed = new EmbedBuilder()
          .setTitle('📈 Daily Fantasy Report')
          .setDescription('⚠️ Report generation encountered an error, but here\'s what we got:\n\n' + 
            (reportContent || 'No content received'))
          .setColor(0xff9900);

        await interaction.editReply({
          embeds: [errorEmbed]
        });
      }

      discordLogger.info({ discordId, yahooUserId, leagueId: targetLeagueId }, 'Daily report completed');

    } catch (error) {
      discordLogger.error({ error, discordId, yahooUserId, leagueId }, 'Daily report failed');
      
      await interaction.editReply({
        content: '❌ Failed to generate daily report. Please try again later.'
      });
    }
  },
};

function parseReportContent(content: string): Array<{ title: string; content: string }> {
  const sections: Array<{ title: string; content: string }> = [];
  
  // Split content by markdown headers
  const lines = content.split('\n');
  let currentSection: { title: string; content: string } | null = null;
  
  for (const line of lines) {
    if (line.startsWith('### ')) {
      // Save previous section
      if (currentSection) {
        sections.push(currentSection);
      }
      // Start new section
      currentSection = {
        title: line.replace('### ', '').trim(),
        content: ''
      };
    } else if (line.startsWith('## ')) {
      // Save previous section
      if (currentSection) {
        sections.push(currentSection);
      }
      // Start new section
      currentSection = {
        title: line.replace('## ', '').trim(),
        content: ''
      };
    } else if (currentSection) {
      currentSection.content += line + '\n';
    }
  }
  
  // Save last section
  if (currentSection) {
    sections.push(currentSection);
  }
  
  return sections.filter(section => section.content.trim().length > 0);
}
