#!/usr/bin/env bash
set -euo pipefail

BASE_URL=${BASE_URL:-http://localhost:3000}
DISCORD_ID=${DISCORD_ID:-dev}

echo "Creating OAuth session for: $DISCORD_ID"
AUTH_URL=$(curl -s -X POST "$BASE_URL/api/oauth/session" \
  -H 'Content-Type: application/json' \
  -d "{\"discordId\":\"$DISCORD_ID\"}" | jq -r '.authorize_url')

if [[ -z "$AUTH_URL" || "$AUTH_URL" == "null" ]]; then
  echo "Failed to obtain authorize_url"
  exit 1
fi

echo "Authorize URL: $AUTH_URL"
echo "Open this in a browser, complete Yahoo OAuth, then run:"
echo "curl -s \"$BASE_URL/api/oauth/status?userId=$DISCORD_ID\" | jq"

