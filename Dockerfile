FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY apps/discord-bot/package*.json ./apps/discord-bot/
COPY packages/data/package*.json ./packages/data/

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Generate Prisma client
RUN npx prisma generate --schema=packages/data/prisma/schema.prisma

# Build the Discord bot
RUN npm run build:discord

# Expose port (not needed for Discord bot, but good practice)
EXPOSE 3000

# Start the Discord bot
CMD ["npm", "run", "start:discord"]