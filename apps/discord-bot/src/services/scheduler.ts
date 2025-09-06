import * as cron from 'node-cron';
import { Client, EmbedBuilder, TextChannel, DMChannel } from 'discord.js';
import { orchestratorApi } from './orchestratorApi';
import { userService } from './userService';
import { discordLogger } from '../utils/logger';
import { env } from '../utils/config';

export class SchedulerService {
  private client: Client;
  private tasks: cron.ScheduledTask[] = [];

  constructor(client: Client) {
    this.client = client;
  }

  /**
   * Initialize all scheduled tasks
   */
  async initialize() {
    if (env.NODE_ENV === 'production') {
      this.scheduleDailyReports();
      this.scheduleWaiverReminders();
      this.scheduleInjuryAlerts();
      
      discordLogger.info('Scheduled tasks initialized for production');
    } else {
      discordLogger.info('Scheduled tasks disabled in development mode');
    }
  }

  /**
   * Schedule daily fantasy reports
   * Runs every day at 8:00 AM
   */
  private scheduleDailyReports() {
    const task = cron.schedule('0 8 * * *', async () => {
      await this.sendDailyReportsToAllUsers();
    }, {
      scheduled: true,
      timezone: 'America/New_York'
    });

    this.tasks.push(task);
    discordLogger.info('Scheduled daily reports for 8:00 AM EST');
  }

  /**
   * Schedule waiver wire reminders
   * Runs on Tuesday at 6:00 PM (before most waiver deadlines)
   */
  private scheduleWaiverReminders() {
    const task = cron.schedule('0 18 * * 2', async () => {
      await this.sendWaiverRemindersToAllUsers();
    }, {
      scheduled: true,
      timezone: 'America/New_York'
    });

    this.tasks.push(task);
    discordLogger.info('Scheduled waiver reminders for Tuesday 6:00 PM EST');
  }

  /**
   * Schedule injury alerts
   * Runs every 2 hours during the season
   */
  private scheduleInjuryAlerts() {
    const task = cron.schedule('0 */2 * * *', async () => {
      await this.checkAndSendInjuryAlerts();
    }, {
      scheduled: true,
      timezone: 'America/New_York'
    });

    this.tasks.push(task);
    discordLogger.info('Scheduled injury alerts every 2 hours');
  }

  /**
   * Send daily reports to all authenticated users
   */
  private async sendDailyReportsToAllUsers() {
    try {
      discordLogger.info('Starting daily report broadcast');

      const authenticatedUsers = await userService.getAllUsers();
      const activeUsers = authenticatedUsers.filter(user => user.isAuthenticated && user.yahooUserId);

      discordLogger.info({ userCount: activeUsers.length }, 'Broadcasting daily reports');

      for (const user of activeUsers) {
        try {
          await this.sendDailyReportToUser(user.discordId);
        } catch (error) {
          discordLogger.error({ 
            error, 
            discordId: user.discordId
          }, 'Failed to send daily report to user');
        }
      }

      discordLogger.info('Daily report broadcast completed');
    } catch (error) {
      discordLogger.error(error, 'Failed to broadcast daily reports');
    }
  }

  /**
   * Send daily report to a specific user
   */
  private async sendDailyReportToUser(discordId: string) {
    try {
      // Get user's leagues
      const leagues = await orchestratorApi.getUserLeagues(discordId);
      if (leagues.length === 0) {
        return;
      }

      const primaryLeague = leagues[0];
      
      // Send DM to user
      const user = await this.client.users.fetch(discordId);
      if (!user) {
        discordLogger.warn({ discordId }, 'Could not find Discord user for daily report');
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle('🌅 Good Morning! Your Daily Fantasy Report')
        .setDescription('Here\'s your personalized fantasy football update for today:')
        .setColor(0x430297)
        .setFooter({
          text: 'Daily Report • Use /report for detailed analysis'
        });

      const message = await user.send({
        embeds: [embed]
      });

      // Stream the report content
      let reportContent = '';
      try {
        for await (const chunk of await orchestratorApi.getDailyReport(discordId, primaryLeague.id)) {
          reportContent += chunk;
        }

        // Update with final report
        const sections = this.parseReportContent(reportContent);
        const finalEmbed = new EmbedBuilder()
          .setTitle('🌅 Good Morning! Your Daily Fantasy Report')
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

        finalEmbed.setFooter({
          text: `League: ${primaryLeague.name || primaryLeague.id} • ${new Date().toLocaleDateString()}`
        });

        await message.edit({
          embeds: [finalEmbed]
        });

        discordLogger.info({ discordId, leagueId: primaryLeague.id }, 'Daily report sent');

      } catch (streamError) {
        discordLogger.error({ streamError, discordId }, 'Error streaming daily report');
        
        const errorEmbed = new EmbedBuilder()
          .setTitle('🌅 Daily Fantasy Report')
          .setDescription('⚠️ Report generation encountered an error. Please use `/report` for your latest analysis.')
          .setColor(0xff9900);

        await message.edit({
          embeds: [errorEmbed]
        });
      }

    } catch (error) {
      discordLogger.error({ error, discordId }, 'Failed to send daily report to user');
    }
  }

  /**
   * Send waiver reminders to all users
   */
  private async sendWaiverRemindersToAllUsers() {
    try {
      discordLogger.info('Starting waiver reminder broadcast');

      const authenticatedUsers = await userService.getAllUsers();
      const activeUsers = authenticatedUsers.filter(user => user.isAuthenticated && user.yahooUserId);

      for (const user of activeUsers) {
        try {
          await this.sendWaiverReminderToUser(user.discordId);
        } catch (error) {
          discordLogger.error({ 
            error, 
            discordId: user.discordId
          }, 'Failed to send waiver reminder to user');
        }
      }

      discordLogger.info('Waiver reminder broadcast completed');
    } catch (error) {
      discordLogger.error(error, 'Failed to broadcast waiver reminders');
    }
  }

  /**
   * Send waiver reminder to a specific user
   */
  private async sendWaiverReminderToUser(discordId: string) {
    try {
      const user = await this.client.users.fetch(discordId);
      if (!user) return;

      const embed = new EmbedBuilder()
        .setTitle('🎯 Waiver Wire Reminder')
        .setDescription(
          'Don\'t forget to check the waiver wire! Waivers typically process tonight.\n\n' +
          '• Use `/waivers` to see recommendations\n' +
          '• Use `/approvals` to review pending claims\n' +
          '• Check your lineup with `/lineup`'
        )
        .setColor(0xffa500)
        .setFooter({
          text: 'Waiver Reminder • Good luck this week!'
        });

      await user.send({
        embeds: [embed]
      });

      discordLogger.info({ discordId }, 'Waiver reminder sent');

    } catch (error) {
      discordLogger.error({ error, discordId }, 'Failed to send waiver reminder');
    }
  }

  /**
   * Check for injury alerts and send notifications
   */
  private async checkAndSendInjuryAlerts() {
    try {
      discordLogger.info('Checking for injury alerts');

      const authenticatedUsers = await userService.getAllUsers();
      const activeUsers = authenticatedUsers.filter(user => user.isAuthenticated && user.yahooUserId);

      for (const user of activeUsers) {
        try {
          await this.checkInjuryAlertsForUser(user.discordId);
        } catch (error) {
          discordLogger.error({ 
            error, 
            discordId: user.discordId
          }, 'Failed to check injury alerts for user');
        }
      }

      discordLogger.info('Injury alert check completed');
    } catch (error) {
      discordLogger.error(error, 'Failed to check injury alerts');
    }
  }

  /**
   * Check injury alerts for a specific user
   */
  private async checkInjuryAlertsForUser(discordId: string) {
    try {
      // This would integrate with the orchestrator's injury monitoring
      // For now, we'll implement a basic check
      
      const leagues = await orchestratorApi.getUserLeagues(discordId);
      if (leagues.length === 0) return;

      // Check for critical injury updates that would trigger alerts
      // This would typically involve comparing current injury status with previous status
      // and alerting on status changes that significantly impact fantasy value

      // Placeholder for injury alert logic
      discordLogger.debug({ discordId }, 'Injury alert check completed (no alerts)');

    } catch (error) {
      discordLogger.error({ error, discordId }, 'Failed to check injury alerts');
    }
  }

  /**
   * Send a proactive message to a specific user
   */
  async sendProactiveMessage(discordId: string, title: string, description: string, color?: number) {
    try {
      const user = await this.client.users.fetch(discordId);
      if (!user) {
        discordLogger.warn({ discordId }, 'Could not find Discord user for proactive message');
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(color || 0x430297)
        .setTimestamp();

      await user.send({
        embeds: [embed]
      });

      discordLogger.info({ discordId, title }, 'Proactive message sent');
    } catch (error) {
      discordLogger.error({ error, discordId, title }, 'Failed to send proactive message');
    }
  }

  /**
   * Broadcast message to all authenticated users
   */
  async broadcastToAllUsers(title: string, description: string, color?: number) {
    try {
      const authenticatedUsers = await userService.getAllUsers();
      const activeUsers = authenticatedUsers.filter(user => user.isAuthenticated);

      discordLogger.info({ userCount: activeUsers.length, title }, 'Broadcasting message to all users');

      for (const user of activeUsers) {
        await this.sendProactiveMessage(user.discordId, title, description, color);
      }

      discordLogger.info('Broadcast completed');
    } catch (error) {
      discordLogger.error(error, 'Failed to broadcast message');
    }
  }

  /**
   * Parse report content into sections (copied from report command)
   */
  private parseReportContent(content: string): Array<{ title: string; content: string }> {
    const sections: Array<{ title: string; content: string }> = [];
    
    const lines = content.split('\n');
    let currentSection: { title: string; content: string } | null = null;
    
    for (const line of lines) {
      if (line.startsWith('### ') || line.startsWith('## ')) {
        if (currentSection) {
          sections.push(currentSection);
        }
        currentSection = {
          title: line.replace(/^#+\s/, '').trim(),
          content: ''
        };
      } else if (currentSection) {
        currentSection.content += line + '\n';
      }
    }
    
    if (currentSection) {
      sections.push(currentSection);
    }
    
    return sections.filter(section => section.content.trim().length > 0);
  }

  /**
   * Stop all scheduled tasks
   */
  destroy() {
    this.tasks.forEach(task => {
      if ('destroy' in task && typeof task.destroy === 'function') {
        task.destroy();
      } else if ('stop' in task && typeof task.stop === 'function') {
        (task as any).stop();
      }
    });
    this.tasks = [];
    discordLogger.info('Scheduler service destroyed');
  }
}

export let schedulerService: SchedulerService | null = null;

export function initializeScheduler(client: Client) {
  schedulerService = new SchedulerService(client);
  return schedulerService;
}