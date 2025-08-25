import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().default('3000'),
  ALLOWED_ORIGINS: z.string().optional(),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  YAHOO_CLIENT_ID: z.string().min(1, 'YAHOO_CLIENT_ID is required'),
  YAHOO_CLIENT_SECRET: z.string().min(1, 'YAHOO_CLIENT_SECRET is required'),
  YAHOO_REDIRECT_URI: z.string().min(1, 'YAHOO_REDIRECT_URI is required'),

  ANTHROPIC_API_KEY: z.string().min(1, 'ANTHROPIC_API_KEY is required'),
  AI_MODEL: z.string().default('claude-3-5-sonnet-20241022'),

  EXECUTION_MODE: z.enum(['stage', 'dry-run', 'live']).default('stage'),
});

export type ExecutionMode = z.infer<typeof EnvSchema>['EXECUTION_MODE'];

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
  throw new Error(`Invalid environment configuration: ${issues}`);
}

export const env = parsed.data;

export const allowedOrigins = (): string[] =>
  (env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(',') : ['http://localhost:3000', 'http://localhost:8501']).map(s => s.trim());

