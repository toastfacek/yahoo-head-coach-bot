# Discord Bot Quick Start

Since we encountered database connectivity issues, here's how to get the Discord bot running:

## ✅ What's Ready

The Discord bot is fully implemented with:
- Slash commands (`/auth`, `/lineup`, `/waivers`, `/report`, `/approvals`)
- Natural language processing
- Interactive buttons for approvals
- API bridge to your existing orchestrator
- Fallback to in-memory storage (no database required for testing)

## 🚀 Quick Setup Steps

### 1. Database Table (Manual - When Connection Available)

Run this SQL in your Supabase SQL editor:

```sql
-- The SQL is in create-discord-table.sql file
```

Or you can skip this step for now - the bot will use in-memory storage.

### 2. Discord Application Setup

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create "New Application" → Name: "Yahoo Fantasy HeadCoach" 
3. Go to "Bot" section → "Add Bot"
4. Copy the **Bot Token**
5. Copy the **Application ID** from General Information

### 3. Environment Variables

Add to your root `.env` file:

```env
# Discord Bot Configuration
DISCORD_TOKEN=your_discord_bot_token_here
DISCORD_CLIENT_ID=your_discord_application_id_here
```

### 4. Bot Permissions

Your bot needs these permissions:
- Send Messages ✅
- Use Slash Commands ✅  
- Embed Links ✅
- Read Message History ✅

Generate invite URL: Discord Developer Portal → OAuth2 → URL Generator
- Scopes: `bot` + `applications.commands`
- Permissions: (check the boxes above)

### 5. Deploy Commands & Start Bot

```bash
# Deploy slash commands to Discord
npm run deploy-commands

# Start orchestrator (Terminal 1)
npm run dev

# Start Discord bot (Terminal 2) 
npm run dev:discord
```

### 6. Invite Bot & Test

1. Use the OAuth2 URL to invite bot to your server
2. Try `/auth login` command
3. Complete Yahoo OAuth flow
4. Test other commands!

## 🧪 Testing Without Database

The Discord bot will work immediately with in-memory storage:
- User authentication mappings stored in memory
- All fantasy features work through the orchestrator API
- Data persists until bot restarts

## 🔧 When Database Connection Works

1. Run the SQL from `create-discord-table.sql` in Supabase
2. Restart the Discord bot
3. User mappings will persist in database

## 📱 Commands to Try

Once setup:

```
/auth login          # Connect Yahoo account
/lineup              # Analyze your lineup
/waivers             # See waiver targets
/report              # Generate daily report
/approvals           # View pending recommendations
```

Or chat naturally:
```
"How's my team looking?"
"Who should I pick up on waivers?"
"Give me my daily report"
```

The bot will work with your existing Yahoo data through the orchestrator API!