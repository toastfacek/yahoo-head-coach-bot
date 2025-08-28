FROM node:18-alpine

WORKDIR /app

# Copy all source code
COPY . .

# Install all dependencies
RUN npm install

# Generate Prisma client
RUN npx prisma generate --schema=packages/data/prisma/schema.prisma

# Build the Discord bot
RUN npm run build:discord

# Expose port
EXPOSE 3000

# Start the Discord bot
CMD ["npm", "run", "start:discord"]