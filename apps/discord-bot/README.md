# Yahoo Fantasy Football Discord Bot

Discord bot interface for the Yahoo Fantasy Football HeadCoach agent. Provides natural language interaction and slash commands for managing your fantasy team.

## Features

- **Slash Commands**: Quick access to key features
  - `/auth login` - Connect your Yahoo Fantasy Football account
  - `/lineup` - Analyze and optimize your lineup
  - `/waivers` - Get waiver wire recommendations
  - `/report` - Generate daily fantasy report

- **Natural Language**: Chat with the bot using normal conversation
  - "How's my lineup looking?"
  - "Who should I pick up on waivers?"
  - "Give me my daily report"

- **Interactive Elements**: Approve/reject recommendations with buttons
- **Streaming Responses**: Real-time report generation
- **Private Authentication**: Secure Yahoo OAuth integration

## Setup

### Prerequisites

1. Discord Application with Bot Token
2. Running orchestrator service (`apps/orchestrator`)
3. Yahoo Fantasy Football account and leagues

### Discord Application Setup

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create new application
3. Go to "Bot" section and create bot
4. Copy Bot Token and Application ID
5. Enable these intents:
   - Message Content Intent
   - Server Members Intent (optional)
6. Generate OAuth2 URL with these scopes:
   - `bot`
   - `applications.commands`
7. Bot permissions needed:
   - Send Messages
   - Use Slash Commands
   - Embed Links
   - Read Message History

### Environment Configuration

Copy `.env.example` to `.env` and fill in:

```bash
cp .env.example .env
```

```env
DISCORD_TOKEN=your_bot_token_here
DISCORD_CLIENT_ID=your_application_id_here
ORCHESTRATOR_URL=http://localhost:3000
NODE_ENV=development
```

### Installation & Running

```bash
# Install dependencies
npm install

# Deploy slash commands to Discord
npm run deploy-commands

# Start development server
npm run dev

# Or build and run production
npm run build
npm start
```

## Usage

### First Time Setup

1. Invite the bot to your Discord server using the OAuth2 URL
2. Run `/auth login` to connect your Yahoo account
3. Complete the Yahoo OAuth flow in your web browser
4. Use `/auth status` to confirm connection

### Daily Usage

**Slash Commands:**
- `/lineup` - Get lineup optimization
- `/waivers` - See waiver wire targets
- `/report` - Generate comprehensive daily report

**Natural Language:**
- Direct message the bot or mention it in a server
- "Should I start Player X or Player Y?"
- "Any good waiver pickups this week?"
- "How did my team do this week?"

### Authentication Flow

1. User runs `/auth login`
2. Bot provides Yahoo OAuth URL
3. User clicks link, authorizes in browser
4. Yahoo redirects to orchestrator callback
5. Orchestrator links Discord user to Yahoo account
6. User can now use all fantasy commands

## Architecture

```
Discord Bot → API Bridge → Orchestrator → Yahoo API
     ↓
User Service (Discord ↔ Yahoo mapping)
```

### Key Components

- **Commands**: Slash command handlers (`src/commands/`)
- **Handlers**: Interaction and message processing (`src/handlers/`)
- **Services**: API integration and user management (`src/services/`)
- **Types**: TypeScript definitions (`src/types/`)

### Data Flow

1. User interacts via Discord (slash command or message)
2. Bot authenticates user and gets Yahoo user ID
3. Request forwarded to orchestrator API
4. Orchestrator runs HeadCoach agent with tools
5. Response formatted and sent back to Discord
6. Interactive elements (buttons) allow follow-up actions

## Development

### Project Structure

```
src/
├── bot.ts              # Main bot file
├── commands/           # Slash command definitions
├── handlers/           # Event and interaction handlers  
├── services/           # External API integrations
├── types/              # TypeScript type definitions
├── utils/              # Configuration and logging
└── scripts/            # Deployment and utility scripts
```

### Adding New Commands

1. Create command file in `src/commands/`
2. Implement `BotCommand` interface
3. Add to `src/handlers/commands.ts`
4. Run `npm run deploy-commands`

### Natural Language Processing

The message handler (`src/handlers/messages.ts`) classifies user intent and routes to appropriate functions:

- Keyword matching for common intents
- Fallback to orchestrator chat API
- Context-aware responses

### Error Handling

- Comprehensive logging with Pino
- Graceful degradation when APIs are down
- User-friendly error messages
- Automatic retry logic where appropriate

## Deployment

### Production Setup

1. Set `NODE_ENV=production`
2. Use PM2 or similar process manager
3. Set up reverse proxy (nginx) if needed
4. Configure log aggregation
5. Set up monitoring and health checks

### Environment Variables

All required environment variables are documented in `.env.example`.

### Health Monitoring

The bot includes health checks for:
- Discord connection status
- Orchestrator API availability
- Database connectivity (if used)

## Troubleshooting

### Common Issues

1. **Commands not showing**: Run `npm run deploy-commands` and wait up to 1 hour
2. **Authentication failed**: Check orchestrator is running and OAuth config is correct
3. **Timeout errors**: Increase timeout values in `src/services/orchestratorApi.ts`
4. **Permission errors**: Verify bot has required Discord permissions

### Debugging

Enable debug logging:
```bash
NODE_ENV=development npm run dev
```

Check logs for detailed request/response information.