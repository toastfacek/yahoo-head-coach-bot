#!/bin/bash

# Quick Essential Checks - Only tests the absolute minimum required for OAuth to work
# Run this for fast validation that core functionality is working

set -e

echo "⚡ Quick OAuth Essentials Check"
echo "=============================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration
ORCHESTRATOR_URL="${ORCHESTRATOR_URL:-http://localhost:3000}"

echo "🔧 Testing: $ORCHESTRATOR_URL"
echo ""

# Test 1: Orchestrator is running
echo -n "1. Orchestrator running... "
if curl -s -f "$ORCHESTRATOR_URL/api/health" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ YES${NC}"
    health_ok=true
else
    echo -e "${RED}❌ NO${NC}"
    health_ok=false
fi

# Test 2: OAuth session endpoint works
echo -n "2. OAuth session creation... "
if [ "$health_ok" = true ]; then
    response=$(curl -s -w "%{http_code}" -X POST \
        -H "Content-Type: application/json" \
        -d '{"discordId":"test-user"}' \
        "$ORCHESTRATOR_URL/api/oauth/session" 2>/dev/null)
    
    http_code="${response: -3}"
    if [ "$http_code" = "200" ]; then
        echo -e "${GREEN}✅ YES${NC}"
        oauth_ok=true
    else
        echo -e "${RED}❌ NO (HTTP $http_code)${NC}"
        oauth_ok=false
    fi
else
    echo -e "${YELLOW}⏭️  SKIPPED (orchestrator not running)${NC}"
    oauth_ok=false
fi

echo ""
echo "📊 Summary:"
echo "=========="

if [ "$health_ok" = true ] && [ "$oauth_ok" = true ]; then
    echo -e "${GREEN}🎉 READY TO GO!${NC}"
    echo ""
    echo "✅ Core OAuth functionality is working"
    echo "✅ You can now start the Discord bot and test /auth login"
    echo ""
    echo "Next steps:"
    echo "  cd apps/discord-bot && npm run dev"
    echo ""
    exit 0
elif [ "$health_ok" = true ]; then
    echo -e "${YELLOW}⚠️  PARTIALLY READY${NC}"
    echo ""
    echo "✅ Orchestrator is running"
    echo "❌ OAuth endpoints have issues (may need Yahoo config)"
    echo ""
    echo "You can still test basic functionality, but full OAuth may not work"
    echo ""
    exit 1
else
    echo -e "${RED}❌ NOT READY${NC}"
    echo ""
    echo "❌ Orchestrator is not running"
    echo ""
    echo "Start the orchestrator first:"
    echo "  cd apps/orchestrator && npm run dev"
    echo ""
    echo "Then run this check again"
    exit 1
fi