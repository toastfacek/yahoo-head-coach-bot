import pino from 'pino';
import { env } from './config';

export const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  transport: env.NODE_ENV === 'development' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      ignore: 'pid,hostname',
      translateTime: 'SYS:standard'
    }
  } : undefined
});

export const discordLogger = logger.child({ service: 'discord-bot' });
export const apiLogger = logger.child({ service: 'api-bridge' });
export const authLogger = logger.child({ service: 'auth' });