FROM node:20-alpine

# Conservative Node.js memory limit for Railway compatibility (can be overridden by env vars)
ENV NODE_OPTIONS="--max-old-space-size=512"
# Ensure devDependencies are installed during build so ts-node is available at runtime
ENV NPM_CONFIG_PRODUCTION=false
ENV TS_NODE_TRANSPILE_ONLY=1

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
RUN chmod +x /app/docker-start.sh
CMD ["sh", "/app/docker-start.sh"]
