#!/bin/bash

# Environment Setup Script for Yahoo Fantasy Football Bot
# This script helps configure the necessary environment variables

set -e  # Exit on any error

echo "🔧 Yahoo Fantasy Football Bot - Environment Setup"
echo "=================================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to check if environment variable is set
check_env() {
    local var_name="$1"
    local var_value="${!var_name}"
    local description="$2"
    local example="$3"
    
    if [ -z "$var_value" ]; then
        echo -e "${RED}❌ Missing: $var_name${NC}"
        echo "   Description: $description"
        echo "   Example: $example"
        echo ""
        return 1
    else
        echo -e "${GREEN}✅ Set: $var_name${NC}"
        if [[ "$var_name" == *"SECRET"* || "$var_name" == *"KEY"* ]]; then
            echo "   Value: [HIDDEN]"
        else
            echo "   Value: $var_value"
        fi
        echo ""
        return 0
    fi
}

echo "Checking required environment variables..."
echo ""

# Track missing variables
missing_count=0

# Discord Bot Configuration
echo "📱 Discord Bot Configuration:"
check_env "DISCORD_TOKEN" "Discord bot token from Discord Developer Portal" "your_discord_bot_token_here" || ((missing_count++))
check_env "DISCORD_CLIENT_ID" "Discord application client ID" "123456789012345678" || ((missing_count++))

# Orchestrator Configuration
echo "🎛️ Orchestrator Configuration:"
check_env "ORCHESTRATOR_URL" "URL where the orchestrator service is running" "http://localhost:3000 (dev) or https://your-domain.com (prod)" || ((missing_count++))

# Database Configuration
echo "🗄️ Database Configuration:"
check_env "DATABASE_URL" "PostgreSQL connection string" "postgresql://username:password@localhost:5432/headcoach" || ((missing_count++))

# Yahoo OAuth Configuration
echo "🏈 Yahoo OAuth Configuration:"
check_env "YAHOO_CLIENT_ID" "Yahoo application client ID from Yahoo Developer Network" "your_yahoo_client_id" || ((missing_count++))
check_env "YAHOO_CLIENT_SECRET" "Yahoo application client secret" "your_yahoo_client_secret" || ((missing_count++))
check_env "YAHOO_REDIRECT_URI" "OAuth redirect URI (must match Yahoo app config)" "http://localhost:3000/api/oauth/callback" || ((missing_count++))

# AI Configuration
echo "🤖 AI Configuration:"
check_env "ANTHROPIC_API_KEY" "Anthropic API key for Claude AI" "sk-ant-api03-..." || ((missing_count++))

# Optional Configuration
echo "⚙️ Optional Configuration:"
check_env "AI_MODEL" "Claude model to use" "claude-3-5-sonnet-20241022" || echo -e "${YELLOW}⚠️  AI_MODEL not set, will use default${NC}"
check_env "NODE_ENV" "Node.js environment" "development or production" || echo -e "${YELLOW}⚠️  NODE_ENV not set, will use development${NC}"
echo ""

# Summary
echo "=================================================="
if [ $missing_count -eq 0 ]; then
    echo -e "${GREEN}🎉 All required environment variables are configured!${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Start the orchestrator: cd apps/orchestrator && npm run dev"
    echo "2. Start the Discord bot: cd apps/discord-bot && npm run dev"
    echo ""
else
    echo -e "${RED}❌ Missing $missing_count required environment variable(s)${NC}"
    echo ""
    echo "To fix this:"
    echo "1. Create a .env file in the project root"
    echo "2. Add the missing variables shown above"
    echo "3. See YAHOO_OAUTH_SETUP.md for Yahoo Developer setup instructions"
    echo "4. Run this script again to verify"
    echo ""
    exit 1
fi

# Additional checks
echo "🔍 Additional Connectivity Checks:"

# Check if orchestrator is reachable (if URL is set)
if [ ! -z "$ORCHESTRATOR_URL" ]; then
    echo "Testing orchestrator connectivity..."
    if curl -s -f "$ORCHESTRATOR_URL/api/health" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Orchestrator is reachable at $ORCHESTRATOR_URL${NC}"
    else
        echo -e "${YELLOW}⚠️  Orchestrator not reachable at $ORCHESTRATOR_URL (this is normal if not running yet)${NC}"
    fi
    echo ""
fi

echo "🏁 Environment setup check complete!"