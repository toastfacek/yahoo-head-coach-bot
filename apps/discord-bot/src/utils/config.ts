import 'dotenv/config';
import { z } from 'zod';

// Relaxed validation so the bot can boot and expose healthcheck
const envSchema = z.object({
  DISCORD_TOKEN: z.string().optional(),
  DISCORD_CLIENT_ID: z.string().optional(),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().optional(),
  // Yahoo OAuth configuration (required for full functionality)
  YAHOO_CLIENT_ID: z.string().optional(),
  YAHOO_CLIENT_SECRET: z.string().optional(),
  YAHOO_REDIRECT_URI: z.string().optional(),
  ENCRYPTION_KEY: z.string().optional(),
});

const parsed = envSchema.safeParse({
  DISCORD_TOKEN: process.env.DISCORD_TOKEN,
  DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID,
  NODE_ENV: process.env.NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL,
  YAHOO_CLIENT_ID: process.env.YAHOO_CLIENT_ID,
  YAHOO_CLIENT_SECRET: process.env.YAHOO_CLIENT_SECRET,
  YAHOO_REDIRECT_URI: process.env.YAHOO_REDIRECT_URI,
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
});

// Log validation warnings but don't exit - let the bot start for healthcheck
if (!parsed.success) {
  console.warn('⚠️ Configuration validation warnings:', parsed.error.format());
  console.warn('🏥 Bot will start with limited functionality to provide health endpoint');
}

export const env = parsed.success ? parsed.data : {
  DISCORD_TOKEN: process.env.DISCORD_TOKEN,
  DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID,
  NODE_ENV: (process.env.NODE_ENV as any) || 'development',
  DATABASE_URL: process.env.DATABASE_URL,
  YAHOO_CLIENT_ID: process.env.YAHOO_CLIENT_ID,
  YAHOO_CLIENT_SECRET: process.env.YAHOO_CLIENT_SECRET,
  YAHOO_REDIRECT_URI: process.env.YAHOO_REDIRECT_URI,
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
};

// Log configuration status
console.log('🤖 Discord bot starting...');
console.log(`📊 Environment: ${env.NODE_ENV}`);
console.log(`🔑 Discord token configured: ${env.DISCORD_TOKEN ? 'Yes' : 'No'}`);
console.log(`🏈 Yahoo OAuth configured: ${env.YAHOO_CLIENT_ID && env.YAHOO_CLIENT_SECRET ? 'Yes' : 'No'}`);
console.log(`🗄️  Database configured: ${env.DATABASE_URL ? 'Yes' : 'No'}`);
console.log(`🔐 Encryption configured: ${env.ENCRYPTION_KEY ? 'Yes' : 'No'}`);

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
