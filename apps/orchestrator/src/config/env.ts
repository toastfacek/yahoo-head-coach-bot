import 'dotenv/config';
import { z } from 'zod';

// Relaxed validation so the server can boot without all secrets.
// Route handlers that need a key should validate on-demand.
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().default('3000'),
  ALLOWED_ORIGINS: z.string().optional(),

  DATABASE_URL: z.string().optional(),

  YAHOO_CLIENT_ID: z.string().optional(),
  YAHOO_CLIENT_SECRET: z.string().optional(),
  YAHOO_REDIRECT_URI: z.string().optional(),

  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default('claude-3-5-sonnet-20241022'),

  EXECUTION_MODE: z.enum(['stage', 'dry-run', 'live']).default('stage'),

  // OAuth session/JWT + optional Redis
  OAUTH_STATE_JWT_SECRET: z.string().optional(),
  JWT_KID: z.string().optional(),
  REDIS_URL: z.string().optional(),
});

export type ExecutionMode = z.infer<typeof EnvSchema>['EXECUTION_MODE'];

const parsed = EnvSchema.safeParse(process.env);

// Never throw at module import time; fall back to defaults
export const env = parsed.success ? parsed.data : ({} as any);

export const allowedOrigins = (): string[] => {
  const raw = (parsed.success && parsed.data.ALLOWED_ORIGINS) || process.env.ALLOWED_ORIGINS;
  const defaults = ['http://localhost:3000'];
  return (raw ? raw.split(',') : defaults).map((s) => s.trim());
};
