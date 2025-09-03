FROM node:20-alpine

# Increase Node.js memory limit (can be overridden by env vars)
ENV NODE_OPTIONS="--max-old-space-size=8192"

WORKDIR /app

# Copy source (monorepo)
COPY . .

# Install deps (workspaces)
RUN npm ci || npm install

# Generate Prisma client for runtime
RUN npx prisma generate --schema=packages/data/prisma/schema.prisma

# Expose typical API port (Railway will inject $PORT)
EXPOSE 3000

# Start selected service with ts-node to avoid build-time compilation
# SERVICE=orchestrator -> API server (ts-node)
# SERVICE=discord      -> Discord bot (ts-node)
CMD ["sh", "-c", "case \"$SERVICE\" in orchestrator) npx ts-node apps/orchestrator/src/server.ts ;; discord) npx ts-node apps/discord-bot/src/bot.ts ;; *) echo 'SERVICE not set, defaulting to orchestrator' && npx ts-node apps/orchestrator/src/server.ts ;; esac"]
