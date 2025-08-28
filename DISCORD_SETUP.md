# Discord Bot Setup Guide

Complete guide for setting up the Yahoo Fantasy Football Discord Bot.

## Prerequisites

- Node.js 18+ and npm
- PostgreSQL database (Supabase or local)
- Discord application with bot token
- Yahoo Developer Network application

## Step 1: Discord Application Setup

### Create Discord Application

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application"
3. Name: "Yahoo Fantasy HeadCoach"
4. Save and copy the **Application ID**

### Create Bot

1. Go to "Bot" section
2. Click "Add Bot"
3. Under "Token", click "Copy" to get your **Bot Token**
4. Enable these intents:
   - Message Content Intent ✅
   - Server Members Intent (optional)

### Bot Permissions

Required permissions:
- Send Messages ✅
- Use Slash Commands ✅
- Embed Links ✅
- Read Message History ✅
- Add Reactions ✅

### OAuth2 URL

1. Go to "OAuth2" → "URL Generator"
2. Scopes: `bot` + `applications.commands`
3. Permissions: (select the required permissions above)
4. Copy the generated URL for inviting bot to servers

## Step 2: Database Schema Migration

The Discord bot requires extending the existing Prisma schema:

```bash
# Navigate to the packages/data directory
cd packages/data

# Generate migration for Discord user mapping
npx prisma migrate dev --name add-discord-user-mapping

# Generate Prisma client
npx prisma generate
```

The migration adds the `DiscordUser` model to link Discord accounts with Yahoo users.

## Step 3: Environment Configuration

Create `.env` file in the project root with Discord-specific variables:

```env
# Existing variables...
YAHOO_CLIENT_ID=your_yahoo_client_id
YAHOO_CLIENT_SECRET=your_yahoo_client_secret
DATABASE_URL=your_database_url
ANTHROPIC_API_KEY=your_anthropic_api_key

# New Discord variables
DISCORD_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_discord_application_id
ORCHESTRATOR_URL=http://localhost:3000
```

## Step 4: Installation & Deployment

### Install Dependencies

```bash
# Install root dependencies
npm install

# Install Discord bot dependencies
npm install --workspace=apps/discord-bot
```

### Deploy Slash Commands

```bash
# Deploy commands to Discord
npm run deploy-commands
```

This registers the bot's slash commands globally (takes up to 1 hour to propagate).

### Start Services

Start both the orchestrator and Discord bot:

```bash
# Terminal 1: Start orchestrator
npm run dev

# Terminal 2: Start Discord bot
npm run dev:discord
```

## Step 5: Bot Invitation & Testing

1. Use the OAuth2 URL from Step 1 to invite the bot to your Discord server
2. Test the bot with `/auth login` command
3. Complete Yahoo OAuth flow
4. Try other commands like `/lineup`, `/waivers`, `/report`

## Commands Overview

### Slash Commands

- `/auth login` - Connect Yahoo Fantasy Football account
- `/auth status` - Check authentication status  
- `/auth logout` - Disconnect Yahoo account
- `/lineup [league]` - Analyze and optimize lineup
- `/waivers [league]` - Get waiver wire recommendations
- `/report [league]` - Generate daily fantasy report
- `/approvals [league]` - View pending recommendations with approval buttons

### Natural Language

The bot also responds to natural language in DMs or when mentioned:

- "How's my lineup looking?"
- "Who should I pick up on waivers?"
- "Give me my daily report"
- "Check my team"

## Architecture Overview

```
Discord User → Discord Bot → Orchestrator API → Yahoo API
                    ↓
              User Service (Discord ↔ Yahoo mapping)
                    ↓
              Database (DiscordUser table)
```

### Authentication Flow

1. User runs `/auth login` in Discord
2. Bot provides Yahoo OAuth URL  
3. User completes OAuth in browser
4. Orchestrator callback links Discord user to Yahoo account
5. User can now use fantasy commands

### Scheduled Notifications

The bot sends proactive notifications:

- **Daily Reports**: 8:00 AM EST every day
- **Waiver Reminders**: Tuesday 6:00 PM EST
- **Injury Alerts**: Every 2 hours during season

## Production Deployment

### Environment Variables

Set `NODE_ENV=production` to enable scheduled notifications.

### Process Management

Use PM2 or similar for production:

```bash
# Build both services
npm run build

# Start orchestrator
pm2 start apps/orchestrator/dist/server.js --name yahoo-orchestrator

# Start Discord bot  
pm2 start apps/discord-bot/dist/bot.js --name yahoo-discord-bot
```

### Hosting Recommendations

- **Orchestrator**: Any VPS, Railway, Fly.io
- **Discord Bot**: Same instance as orchestrator or separate
- **Database**: Supabase, PlanetScale, or managed PostgreSQL

## Troubleshooting

### Common Issues

1. **Commands not showing**: 
   - Run `npm run deploy-commands`
   - Wait up to 1 hour for global command propagation
   - Check bot has `applications.commands` scope

2. **Authentication errors**:
   - Verify `ORCHESTRATOR_URL` points to running instance
   - Check Yahoo OAuth configuration
   - Ensure database migration completed

3. **Permission errors**:
   - Verify bot has required permissions in Discord server
   - Check `DISCORD_TOKEN` is valid
   - Ensure bot is online (check Discord status)

4. **Database errors**:
   - Run `npx prisma migrate deploy`
   - Verify `DATABASE_URL` is correct
   - Check database connectivity

### Debug Mode

Enable debug logging:

```bash
NODE_ENV=development npm run dev:discord
```

### Health Checks

The bot logs health status on startup:
- Discord connection
- Orchestrator API connectivity  
- Database connectivity
- Command registration status

## Support

For issues:
1. Check Discord Developer Portal for bot status
2. Review logs for error messages
3. Verify all environment variables are set
4. Test orchestrator API endpoints independently

## Features

### Interactive Elements

- **Approval Buttons**: Approve/reject recommendations directly in Discord
- **Detail Views**: Get comprehensive analysis with "More Details" button
- **Real-time Streaming**: Watch reports generate in real-time
- **Rich Embeds**: Beautiful formatting with team colors and emojis

### Personalization

- **Per-user Authentication**: Each Discord user links their own Yahoo account
- **Multi-league Support**: Specify league or use primary league
- **Preference Memory**: Bot remembers user settings and preferences

### Smart Features

- **Natural Language Processing**: Understands conversational queries
- **Context-aware Responses**: Provides relevant information based on context
- **Proactive Notifications**: Sends timely updates without being asked
- **Error Recovery**: Graceful handling of API failures and rate limits