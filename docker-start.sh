#!/bin/sh
set -e

case "$SERVICE" in
  orchestrator)
    export TS_NODE_PROJECT=apps/orchestrator/tsconfig.json
    exec node -r ts-node/register/transpile-only apps/orchestrator/src/server.ts
    ;;
  discord)
    export TS_NODE_PROJECT=apps/discord-bot/tsconfig.json
    exec node -r ts-node/register/transpile-only apps/discord-bot/src/bot.ts
    ;;
  *)
    echo "SERVICE not set, defaulting to orchestrator"
    export TS_NODE_PROJECT=apps/orchestrator/tsconfig.json
    exec node -r ts-node/register/transpile-only apps/orchestrator/src/server.ts
    ;;
esac

