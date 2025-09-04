#!/bin/bash

# OAuth Flow Test Script
# This script tests the complete OAuth flow between Discord bot and orchestrator

set -e

echo "🧪 OAuth Flow Integration Test"
echo "============================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
ORCHESTRATOR_URL="${ORCHESTRATOR_URL:-http://localhost:3000}"
TEST_DISCORD_ID="test-discord-user-$(date +%s)"

echo -e "${BLUE}🔧 Test Configuration:${NC}"
echo "   Orchestrator URL: $ORCHESTRATOR_URL"
echo "   Test Discord ID: $TEST_DISCORD_ID"
echo ""

# Function to test an endpoint
test_endpoint() {
    local name="$1"
    local url="$2"
    local expected_code="$3"
    local method="${4:-GET}"
    
    echo -n "Testing $name... "
    
    if [ "$method" = "POST" ]; then
        response=$(curl -s -w "HTTPSTATUS:%{http_code}" -X POST \
            -H "Content-Type: application/json" \
            -d "{\"discordId\":\"$TEST_DISCORD_ID\"}" \
            "$url" || echo "HTTPSTATUS:000")
    else
        response=$(curl -s -w "HTTPSTATUS:%{http_code}" "$url" || echo "HTTPSTATUS:000")
    fi
    
    http_code=$(echo "$response" | grep -o "HTTPSTATUS:[0-9]*" | cut -d: -f2)
    body=$(echo "$response" | sed 's/HTTPSTATUS:[0-9]*$//')
    
    if [ "$http_code" = "$expected_code" ]; then
        echo -e "${GREEN}✅ OK (HTTP $http_code)${NC}"
        return 0
    else
        echo -e "${RED}❌ FAILED (HTTP $http_code, expected $expected_code)${NC}"
        if [ ! -z "$body" ] && [ "$body" != "null" ]; then
            echo "   Response: $body" | head -c 200
            echo "..."
        fi
        return 1
    fi
}

# Test counter
passed=0
total=0

echo -e "${BLUE}🏥 Health Check Tests:${NC}"

# Test orchestrator health endpoint
((total++))
if test_endpoint "Orchestrator health" "$ORCHESTRATOR_URL/api/health" "200"; then
    ((passed++))
    
    # Parse health response to check database status
    health_response=$(curl -s "$ORCHESTRATOR_URL/api/health")
    db_connected=$(echo "$health_response" | grep -o '"connected":[^,}]*' | cut -d: -f2 | tr -d ' "')
    
    if [ "$db_connected" = "true" ]; then
        echo -e "   ${GREEN}✅ Database is connected${NC}"
    else
        echo -e "   ${YELLOW}⚠️  Database is not connected (will use fallback)${NC}"
    fi
fi

echo ""
echo -e "${BLUE}🔐 OAuth Flow Tests:${NC}"

# Test OAuth session creation
((total++))
if test_endpoint "OAuth session creation" "$ORCHESTRATOR_URL/api/oauth/session" "200" "POST"; then
    ((passed++))
    
    # Try to extract the authorize_url
    session_response=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -d "{\"discordId\":\"$TEST_DISCORD_ID\"}" \
        "$ORCHESTRATOR_URL/api/oauth/session")
    
    auth_url=$(echo "$session_response" | grep -o '"authorize_url":"[^"]*' | cut -d'"' -f4)
    
    if [ ! -z "$auth_url" ]; then
        echo -e "   ${GREEN}✅ OAuth URL generated successfully${NC}"
        echo "   URL: ${auth_url:0:80}..."
        
        # Test that the OAuth start endpoint exists
        ((total++))
        start_url=$(echo "$auth_url" | sed 's/\?.*$//')
        if test_endpoint "OAuth start endpoint" "$start_url?state=test" "400"; then
            ((passed++))
            echo -e "   ${GREEN}✅ OAuth start endpoint properly validates state${NC}"
        fi
    else
        echo -e "   ${RED}❌ No authorize_url in response${NC}"
    fi
fi

# Test OAuth status endpoint
((total++))
if test_endpoint "OAuth status check" "$ORCHESTRATOR_URL/api/oauth/status?userId=$TEST_DISCORD_ID" "200"; then
    ((passed++))
    
    # Check that it returns proper JSON structure
    status_response=$(curl -s "$ORCHESTRATOR_URL/api/oauth/status?userId=$TEST_DISCORD_ID")
    authenticated=$(echo "$status_response" | grep -o '"authenticated":[^,}]*' | cut -d: -f2 | tr -d ' "')
    
    if [ "$authenticated" = "false" ]; then
        echo -e "   ${GREEN}✅ Status correctly shows not authenticated${NC}"
    else
        echo -e "   ${YELLOW}⚠️  Unexpected authentication status: $authenticated${NC}"
    fi
fi

echo ""
echo -e "${BLUE}📊 Test Results:${NC}"
echo "================================"

if [ $passed -eq $total ]; then
    echo -e "${GREEN}🎉 All tests passed! ($passed/$total)${NC}"
    echo ""
    echo -e "${GREEN}✅ OAuth integration is working correctly${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Start the Discord bot: cd apps/discord-bot && npm run dev"
    echo "2. Test with real Discord commands: /auth login"
    echo ""
    exit 0
else
    echo -e "${RED}❌ Some tests failed ($passed/$total passed)${NC}"
    echo ""
    echo "Common issues and solutions:"
    echo ""
    echo "1. If orchestrator health fails:"
    echo "   - Ensure orchestrator is running: cd apps/orchestrator && npm run dev"
    echo "   - Check ORCHESTRATOR_URL is correct"
    echo ""
    echo "2. If database connection fails:"
    echo "   - Check DATABASE_URL environment variable"
    echo "   - Ensure database is running and accessible"
    echo ""
    echo "3. If OAuth endpoints fail:"
    echo "   - Verify Yahoo OAuth configuration (CLIENT_ID, CLIENT_SECRET, REDIRECT_URI)"
    echo "   - Check that all required environment variables are set"
    echo ""
    exit 1
fi