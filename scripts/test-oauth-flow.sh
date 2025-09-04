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
    local essential="${5:-false}"
    
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
        if [ "$essential" = "true" ]; then
            ((essential_passed++))
        fi
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
essential_passed=0
essential_total=0

echo -e "${BLUE}🏥 Health Check Tests:${NC}"

# Test orchestrator health endpoint (ESSENTIAL)
echo -e "${BLUE}🚨 Essential: Orchestrator must be running${NC}"
((total++))
((essential_total++))
if test_endpoint "Orchestrator health" "$ORCHESTRATOR_URL/api/health" "200" "GET" "true"; then
    ((passed++))
    
    # Parse health response to check database status (OPTIONAL)
    health_response=$(curl -s "$ORCHESTRATOR_URL/api/health" 2>/dev/null)
    if [ $? -eq 0 ]; then
        db_connected=$(echo "$health_response" | grep -o '"connected":[^,}]*' | cut -d: -f2 | tr -d ' "' 2>/dev/null)
        
        if [ "$db_connected" = "true" ]; then
            echo -e "   ${GREEN}✅ Database is connected${NC}"
        else
            echo -e "   ${YELLOW}⚠️  Database is not connected (will use fallback - this is OK)${NC}"
        fi
    fi
fi

echo ""
echo -e "${BLUE}🔐 OAuth Flow Tests:${NC}"

# Test OAuth session creation (ESSENTIAL)
echo -e "${BLUE}🚨 Essential: OAuth session creation${NC}"
((total++))
((essential_total++))
if test_endpoint "OAuth session creation" "$ORCHESTRATOR_URL/api/oauth/session" "200" "POST" "true"; then
    ((passed++))
    
    # Try to extract the authorize_url
    session_response=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -d "{\"discordId\":\"$TEST_DISCORD_ID\"}" \
        "$ORCHESTRATOR_URL/api/oauth/session" 2>/dev/null)
    
    if [ $? -eq 0 ]; then
        auth_url=$(echo "$session_response" | grep -o '"authorize_url":"[^"]*' | cut -d'"' -f4 2>/dev/null)
        
        if [ ! -z "$auth_url" ]; then
            echo -e "   ${GREEN}✅ OAuth URL generated successfully${NC}"
            echo "   URL: ${auth_url:0:80}..."
            
            # Test that the OAuth start endpoint exists (OPTIONAL)
            echo -e "${BLUE}📋 Optional: OAuth start validation${NC}"
            ((total++))
            start_url=$(echo "$auth_url" | sed 's/\?.*$//')
            if test_endpoint "OAuth start endpoint" "$start_url?state=test" "400"; then
                ((passed++))
                echo -e "   ${GREEN}✅ OAuth start endpoint properly validates state${NC}"
            else
                echo -e "   ${YELLOW}⚠️  OAuth start validation failed (this may be OK if Yahoo config is missing)${NC}"
            fi
        else
            echo -e "   ${RED}❌ No authorize_url in response${NC}"
        fi
    fi
fi

# Test OAuth status endpoint (OPTIONAL)
echo -e "${BLUE}📋 Optional: OAuth status check${NC}"
((total++))
if test_endpoint "OAuth status check" "$ORCHESTRATOR_URL/api/oauth/status?userId=$TEST_DISCORD_ID" "200"; then
    ((passed++))
    
    # Check that it returns proper JSON structure
    status_response=$(curl -s "$ORCHESTRATOR_URL/api/oauth/status?userId=$TEST_DISCORD_ID" 2>/dev/null)
    if [ $? -eq 0 ]; then
        authenticated=$(echo "$status_response" | grep -o '"authenticated":[^,}]*' | cut -d: -f2 | tr -d ' "' 2>/dev/null)
        
        if [ "$authenticated" = "false" ]; then
            echo -e "   ${GREEN}✅ Status correctly shows not authenticated${NC}"
        else
            echo -e "   ${YELLOW}⚠️  Unexpected authentication status: $authenticated${NC}"
        fi
    fi
else
    echo -e "   ${YELLOW}⚠️  Status check failed (this may be OK if database is not connected)${NC}"
fi

echo ""
echo -e "${BLUE}📊 Test Results:${NC}"
echo "================================"

echo "Essential tests: $essential_passed/$essential_total passed"
echo "All tests: $passed/$total passed"
echo ""

if [ $essential_passed -eq $essential_total ]; then
    echo -e "${GREEN}🎉 All ESSENTIAL tests passed! Core OAuth functionality is working${NC}"
    
    if [ $passed -eq $total ]; then
        echo -e "${GREEN}✅ All optional tests also passed - perfect setup!${NC}"
    else
        echo -e "${YELLOW}⚠️  Some optional tests failed, but this is OK for basic functionality${NC}"
        failed_optional=$((total - passed))
        echo -e "${YELLOW}   $failed_optional optional checks failed (database connection, full OAuth config, etc.)${NC}"
    fi
    
    echo ""
    echo -e "${GREEN}✅ OAuth integration is ready for use${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Start the Discord bot: cd apps/discord-bot && npm run dev"
    echo "2. Test with real Discord commands: /auth login"
    echo ""
    exit 0
else
    echo -e "${RED}❌ ESSENTIAL tests failed ($essential_passed/$essential_total)${NC}"
    echo -e "${RED}   Core OAuth functionality is not working properly${NC}"
    echo ""
    echo -e "${YELLOW}Common issues and solutions:${NC}"
    echo ""
    echo "🚨 CRITICAL (must fix):"
    echo "   - Ensure orchestrator is running: cd apps/orchestrator && npm run dev"
    echo "   - Check ORCHESTRATOR_URL is correct: $ORCHESTRATOR_URL"
    echo ""
    echo "📋 Optional (can work without):"
    echo "   - Database connection (will use in-memory fallback)"
    echo "   - Full Yahoo OAuth config (can test basic flow without it)"
    echo "   - All environment variables (some features may be limited)"
    echo ""
    echo "💡 Tip: Run this test after starting the orchestrator to check essential functionality"
    echo ""
    exit 1
fi