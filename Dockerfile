FROM node:18-alpine

# Increase Node.js memory limit
ENV NODE_OPTIONS="--max-old-space-size=2048"

WORKDIR /app

# Copy all source code
COPY . .

# Install all dependencies
RUN npm install

# Generate Prisma client
RUN npx prisma generate --schema=packages/data/prisma/schema.prisma

# Expose port
EXPOSE 3000

# Start the Discord bot directly with ts-node (skip build step)
CMD ["sh", "-c", "cd /app && npx ts-node apps/discord-bot/src/bot.ts"]