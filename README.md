# Fantasy Football Agent System

An autonomous AI-powered system for managing Yahoo Fantasy Football teams using Claude AI, MCP servers, and Discord integration.

## Features

- 🤖 **AI-Powered Decision Making**: Uses Claude 4 Sonnet with reasoning for strategic decisions
- 📊 **Multi-Source Data Aggregation**: Scrapes news from The Athletic, Rotoballer, Reddit, and Twitter
- 🏈 **Automated Roster Management**: Handles waivers, lineups, and trades
- 💬 **Discord Integration**: Full control and notifications through Discord
- 📈 **Performance Tracking**: Comprehensive metrics and decision history
- 🎯 **Confidence Scoring**: Every recommendation includes confidence levels
- 📝 **Transparent Reasoning**: See exactly why decisions are made

## Quick Start

### Prerequisites

- Python 3.9+
- Yahoo Fantasy Football league
- Discord server
- Anthropic API key

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/fantasy-football-agent.git
cd fantasy-football-agent

2. Run setup script:
chmod +x scripts/setup.sh
./scripts/setup.sh

Configure environment:

bashcp .env.example .env
# Edit .env with your API keys and configuration

Initialize Yahoo OAuth:

bashpython scripts/init_yahoo_auth.py

Start the system:

bashpython main.py
Discord Commands

!status - View current team status
!roster - Display current roster
!waivers - Analyze waiver wire targets
!lineup [week] - Optimize lineup
!report - Generate comprehensive report
!chat [message] - Chat with HeadCoach
!approve [id] - Approve pending action
!help - Show all commands

Architecture
MCP Servers (Data Layer)

yahoo-fantasy-server: Yahoo Fantasy API operations
fantasy-data-server: External data aggregation
team-context-server: Team memory and state

AI Agents (Intelligence Layer)

HeadCoach: Main orchestrator using Claude 4 Sonnet
Analyst: Complex analysis using Claude 3.5 Sonnet

Interface Layer

Discord Bot: User interaction and notifications

Configuration
Season Phases
The system automatically adjusts strategies based on season phase:

Early Season (Weeks 1-6): Aggressive FAB spending, identify breakouts
Mid Season (Weeks 7-11): Active trading, roster optimization
Late Season (Weeks 12-14): Playoff preparation, conservative FAB
Playoffs (Weeks 15-17): Win-now mode, maximize ceiling

FAB Strategy
Bidding is adjusted based on:

Player impact (league winner, starter, depth)
Season phase
Remaining budget
League-mate tendencies

Development
Running Tests
bashpytest tests/
Debug Mode
bashpython -m core.debug_mode
Docker Deployment
bashdocker-compose up -d
Monitoring

Logs: logs/fantasy_bot.log
Decisions: logs/decisions.log
Metrics: logs/metrics.json
Team Journal: team_data/team_journal.md

Cost Estimation

Conservative Usage: ~$20-25/season
Moderate Usage: ~$25-35/season
Heavy Usage: ~$35-50/season

Troubleshooting
See TROUBLESHOOTING.md for common issues and solutions.
Contributing

Fork the repository
Create a feature branch
Make your changes
Add tests
Submit a pull request

License
MIT License - see LICENSE file
Acknowledgments

Claude AI by Anthropic
Yahoo Fantasy Sports API
YFPY library
Discord.py
The fantasy football community

Support
For issues and questions:

Open an issue on GitHub
Check the documentation
Join our Discord server


Disclaimer: This bot is for educational purposes. Always verify important decisions manually. The authors are not responsible for your fantasy football performance.