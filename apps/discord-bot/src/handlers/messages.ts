import { Message, EmbedBuilder } from 'discord.js';
import { ExtendedClient } from '../types/discord';
import { orchestratorApi } from '../services/orchestratorApi';
import { userService } from '../services/userService';
import { discordLogger } from '../utils/logger';

export async function handleMessage(client: ExtendedClient, message: Message) {
  // Ignore messages from bots
  if (message.author.bot) return;

  // Only handle DMs or mentions for natural language processing
  const isDM = !message.guild;
  const isMention = message.mentions.has(client.user!);
  
  if (!isDM && !isMention) return;

  const discordId = message.author.id;
  const content = message.content.replace(/<@!?\d+>/g, '').trim(); // Remove mentions

  // Ignore empty messages
  if (!content) return;

  discordLogger.info({
    userId: discordId,
    username: message.author.username,
    content: content.substring(0, 100), // Log first 100 chars
    isDM,
    isMention
  }, 'Processing natural language message');

  try {
    // Check if user is authenticated
    const isAuth = await userService.isAuthenticated(discordId);
    if (!isAuth) {
      await message.reply(
        '🔐 Hi there! I\'d love to help with your fantasy team, but you need to authenticate first.\n' +
        'Use `/auth login` to connect your Yahoo Fantasy Football account!'
      );
      return;
    }

    const yahooUserId = await userService.getYahooUserId(discordId);
    if (!yahooUserId) {
      await message.reply(
        '❌ There seems to be an authentication issue. Please try:\n' +
        '1. `/auth logout`\n' +
        '2. `/auth login`'
      );
      return;
    }

    // Show typing indicator while processing
    if ('sendTyping' in message.channel) {
      await message.channel.sendTyping();
    }

    // Determine user's intent from the message
    const intent = classifyUserIntent(content);
    
    if (intent === 'unknown') {
      // Send to orchestrator for general chat processing
      await handleGeneralChat(message, yahooUserId, content);
    } else {
      // Handle specific intents
      await handleSpecificIntent(message, yahooUserId, intent, content);
    }

  } catch (error) {
    discordLogger.error({ error, discordId, content }, 'Error processing message');
    await message.reply(
      '❌ Sorry, I encountered an error processing your message. Please try again or use a slash command.'
    );
  }
}

function classifyUserIntent(content: string): string {
  const lowerContent = content.toLowerCase();
  
  // Lineup-related keywords
  if (lowerContent.includes('lineup') || lowerContent.includes('start') || lowerContent.includes('bench') || 
      lowerContent.includes('sit') || lowerContent.includes('flex') || lowerContent.includes('optimize')) {
    return 'lineup';
  }
  
  // Waiver-related keywords
  if (lowerContent.includes('waiver') || lowerContent.includes('pickup') || lowerContent.includes('drop') || 
      lowerContent.includes('add') || lowerContent.includes('wire') || lowerContent.includes('available')) {
    return 'waivers';
  }
  
  // Report-related keywords
  if (lowerContent.includes('report') || lowerContent.includes('summary') || lowerContent.includes('analysis') ||
      lowerContent.includes('how am i doing') || lowerContent.includes('overview')) {
    return 'report';
  }
  
  // League/team info keywords
  if (lowerContent.includes('team') || lowerContent.includes('roster') || lowerContent.includes('league') ||
      lowerContent.includes('standings') || lowerContent.includes('record')) {
    return 'team_info';
  }
  
  // Injury/news keywords
  if (lowerContent.includes('injury') || lowerContent.includes('news') || lowerContent.includes('update') ||
      lowerContent.includes('status') || lowerContent.includes('healthy')) {
    return 'news';
  }
  
  return 'unknown';
}

async function handleSpecificIntent(message: Message, yahooUserId: string, intent: string, content: string) {
  let response = '';
  
  try {
    // Get user's primary league
    const leagues = await orchestratorApi.getUserLeagues(yahooUserId);
    const leagueId = leagues.length > 0 ? leagues[0].id : null;
    
    if (!leagueId) {
      await message.reply('❌ No fantasy leagues found for your account.');
      return;
    }

    switch (intent) {
      case 'lineup':
        response = '📊 Let me analyze your lineup...';
        await message.reply(response);
        
        const lineupData = await orchestratorApi.checkLineup(yahooUserId, leagueId);
        await sendLineupResponse(message, lineupData);
        break;
        
      case 'waivers':
        response = '🔍 Checking the waiver wire for opportunities...';
        await message.reply(response);
        
        const waiverData = await orchestratorApi.analyzeWaivers(yahooUserId, leagueId);
        await sendWaiverResponse(message, waiverData);
        break;
        
      case 'report':
        response = '📈 Generating your daily fantasy report...';
        const reportMessage = await message.reply(response);
        
        await streamReportResponse(reportMessage, yahooUserId, leagueId);
        break;
        
      case 'team_info':
        response = '📋 Let me get your team information...';
        await message.reply(response);
        // Could implement team stats/roster display
        break;
        
      case 'news':
        response = '📰 Checking for the latest fantasy news...';
        await message.reply(response);
        // Could implement news/injury updates
        break;
    }
    
  } catch (error) {
    discordLogger.error({ error, intent, yahooUserId }, 'Error handling specific intent');
    await message.reply('❌ Sorry, I encountered an error processing your request.');
  }
}

async function handleGeneralChat(message: Message, yahooUserId: string, content: string) {
  try {
    // Stream response from orchestrator chat endpoint
    let chatResponse = '';
    
    for await (const chunk of await orchestratorApi.sendChatMessage(yahooUserId, content)) {
      chatResponse += chunk;
    }
    
    if (chatResponse.trim()) {
      // Split long responses into multiple messages
      const maxLength = 2000; // Discord message limit
      if (chatResponse.length > maxLength) {
        const chunks = splitMessage(chatResponse, maxLength);
        for (const chunk of chunks) {
          await message.reply(chunk);
        }
      } else {
        await message.reply(chatResponse);
      }
    } else {
      await message.reply(
        '🤔 I\'m not sure how to help with that. Try asking about your lineup, waivers, or use a slash command!'
      );
    }
    
  } catch (error) {
    discordLogger.error({ error, yahooUserId, content }, 'Error in general chat');
    await message.reply(
      '❌ Sorry, I\'m having trouble understanding your request right now. Try using a slash command instead!'
    );
  }
}

async function sendLineupResponse(message: Message, lineupData: any) {
  const embed = new EmbedBuilder()
    .setTitle('📊 Lineup Analysis')
    .setColor(0x430297);

  if (lineupData.lineup.length > 0) {
    const lineupText = lineupData.lineup
      .map((rec: any) => `• ${rec.action} - **${rec.player}**\n  ${rec.reason}`)
      .join('\n\n');
    
    embed.addFields({
      name: '🔄 Recommended Changes',
      value: lineupText.length > 1024 ? lineupText.substring(0, 1021) + '...' : lineupText,
      inline: false
    });
  } else {
    embed.addFields({
      name: '✅ Lineup Status',
      value: 'Your lineup looks good! No changes recommended.',
      inline: false
    });
  }

  await message.reply({ embeds: [embed] });
}

async function sendWaiverResponse(message: Message, waiverData: any) {
  const embed = new EmbedBuilder()
    .setTitle('🔍 Waiver Wire Analysis')
    .setColor(0x430297);

  if (waiverData.waivers.length > 0) {
    const waiverText = waiverData.waivers
      .map((rec: any) => `• ${rec.action} - **${rec.player}**\n  Confidence: ${Math.round(rec.confidence * 100)}%`)
      .join('\n\n');
    
    embed.addFields({
      name: '🎯 Top Targets',
      value: waiverText.length > 1024 ? waiverText.substring(0, 1021) + '...' : waiverText,
      inline: false
    });
  } else {
    embed.addFields({
      name: '💤 Waiver Status',
      value: 'No compelling waiver targets found right now.',
      inline: false
    });
  }

  await message.reply({ embeds: [embed] });
}

async function streamReportResponse(message: Message, yahooUserId: string, leagueId: string) {
  let reportContent = '';
  
  try {
    for await (const chunk of await orchestratorApi.getDailyReport(yahooUserId, leagueId)) {
      reportContent += chunk;
      
      // Update message periodically (rate limit friendly)
      if (reportContent.length % 200 === 0) { // Every 200 characters
        const preview = reportContent.length > 1500 ? 
          reportContent.substring(0, 1500) + '\n\n*...report continuing...*' : 
          reportContent;
          
        try {
          await message.edit('📈 **Daily Fantasy Report**\n\n' + preview);
        } catch {
          // Ignore rate limit errors
        }
      }
    }
    
    // Final update
    const finalContent = reportContent.length > 1900 ? 
      reportContent.substring(0, 1900) + '\n\n*[Report truncated - use `/report` for full version]*' : 
      reportContent;
      
    await message.edit('📈 **Daily Fantasy Report**\n\n' + finalContent);
    
  } catch (error) {
    discordLogger.error({ error, yahooUserId, leagueId }, 'Error streaming report');
    await message.edit('❌ Error generating report. Please try the `/report` command.');
  }
}

function splitMessage(text: string, maxLength: number): string[] {
  const chunks: string[] = [];
  let currentChunk = '';
  
  const lines = text.split('\n');
  
  for (const line of lines) {
    if ((currentChunk + line + '\n').length > maxLength) {
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }
    }
    currentChunk += line + '\n';
  }
  
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks;
}