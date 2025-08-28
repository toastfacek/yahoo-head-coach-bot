FROM node:20-alpine

# Increase Node.js memory limit
ENV NODE_OPTIONS="--max-old-space-size=2048"

WORKDIR /app

# Copy source (monorepo)
COPY . .

# Install deps (workspaces)
RUN npm ci || npm install

# Generate Prisma client for runtime
RUN npx prisma generate --schema=packages/data/prisma/schema.prisma

# Build apps (orchestrator + discord)
RUN npm run build

# Expose typical API port (Railway will inject $PORT)
EXPOSE 3000

# Start selected service based on $SERVICE
# SERVICE=orchestrator -> API server
# SERVICE=discord      -> Discord bot
CMD ["sh", "-c", "case \"$SERVICE\" in orchestrator) node apps/orchestrator/dist/server.js ;; discord) node apps/discord-bot/dist/bot.js ;; *) echo 'SERVICE not set, defaulting to orchestrator' && node apps/orchestrator/dist/server.js ;; esac"]
