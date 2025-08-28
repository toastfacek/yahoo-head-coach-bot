import 'dotenv/config';
import { z } from 'zod';

// Relaxed validation so the bot can boot and expose healthcheck
const envSchema = z.object({
  DISCORD_TOKEN: z.string().optional(),
  DISCORD_CLIENT_ID: z.string().optional(),
  ORCHESTRATOR_URL: z.string().default('http://localhost:3000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().optional(),
});

const parsed = envSchema.safeParse({
  DISCORD_TOKEN: process.env.DISCORD_TOKEN,
  DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID,
  ORCHESTRATOR_URL: process.env.ORCHESTRATOR_URL,
  NODE_ENV: process.env.NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL,
});

export const env = parsed.success ? parsed.data : { ORCHESTRATOR_URL: 'http://localhost:3000', NODE_ENV: 'production' } as any;

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
