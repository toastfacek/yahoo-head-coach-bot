import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables
dotenv.config({ path: '../../.env' });

const envSchema = z.object({
  DISCORD_TOKEN: z.string().min(1, 'Discord bot token is required'),
  DISCORD_CLIENT_ID: z.string().min(1, 'Discord client ID is required'),
  ORCHESTRATOR_URL: z.string().default('http://localhost:3000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().optional(),
});

const env = envSchema.parse({
  DISCORD_TOKEN: process.env.DISCORD_TOKEN,
  DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID,
  ORCHESTRATOR_URL: process.env.ORCHESTRATOR_URL,
  NODE_ENV: process.env.NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL,
});

export { env };

export const discordConfig = {
  intents: [
    'Guilds',
    'GuildMessages',
    'DirectMessages',
    'MessageContent',
  ] as const,
  partials: [
    'Channel',
    'Message',
  ] as const,
};