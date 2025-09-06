import 'dotenv/config';
import { z } from 'zod';

// Relaxed validation so the bot can boot and expose healthcheck
const envSchema = z.object({
  DISCORD_TOKEN: z.string().optional(),
  DISCORD_CLIENT_ID: z.string().optional(),
  ORCHESTRATOR_URL: z.string().min(1),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().optional(),
  // Yahoo OAuth configuration
  YAHOO_CLIENT_ID: z.string().optional(),
  YAHOO_CLIENT_SECRET: z.string().optional(),
  YAHOO_REDIRECT_URI: z.string().optional(),
  ENCRYPTION_KEY: z.string().optional(),
});

const parsed = envSchema.safeParse({
  DISCORD_TOKEN: process.env.DISCORD_TOKEN,
  DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID,
  ORCHESTRATOR_URL: process.env.ORCHESTRATOR_URL,
  NODE_ENV: process.env.NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL,
  YAHOO_CLIENT_ID: process.env.YAHOO_CLIENT_ID,
  YAHOO_CLIENT_SECRET: process.env.YAHOO_CLIENT_SECRET,
  YAHOO_REDIRECT_URI: process.env.YAHOO_REDIRECT_URI,
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
});

// Provide better error handling for required environment variables
if (!parsed.success) {
  console.error('❌ Configuration validation failed:', parsed.error.format());
  if (!process.env.ORCHESTRATOR_URL) {
    console.error('🚨 ORCHESTRATOR_URL is required but not set! Please configure it in your environment.');
    console.error('📝 For local development, set: ORCHESTRATOR_URL=http://localhost:8080');
    console.error('🚀 For production, set: ORCHESTRATOR_URL=https://your-orchestrator-domain');
    process.exit(1);
  }
  process.exit(1);
}

export const env = parsed.data;

// Log configuration status
console.log('✅ ORCHESTRATOR_URL configured:', env.ORCHESTRATOR_URL);
if (env.ORCHESTRATOR_URL.includes('localhost')) {
  console.warn('⚠️  Using localhost orchestrator URL - ensure orchestrator is running locally');
}

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
