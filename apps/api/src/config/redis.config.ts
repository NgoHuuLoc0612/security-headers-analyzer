// apps/api/src/config/redis.config.ts
import { registerAs } from '@nestjs/config';

export const redisConfig = registerAs('redis', () => ({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB || '0', 10),
  keyPrefix: process.env.REDIS_KEY_PREFIX || 'sha:',

  // Cache db
  cacheDb: parseInt(process.env.REDIS_CACHE_DB || '1', 10),
  // Session db
  sessionDb: parseInt(process.env.REDIS_SESSION_DB || '2', 10),
  // Metrics db
  metricsDb: parseInt(process.env.REDIS_METRICS_DB || '3', 10),

  // Connection pool
  maxConnections: parseInt(process.env.REDIS_MAX_CONNECTIONS || '50', 10),
  connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT || '10000', 10),
  commandTimeout: parseInt(process.env.REDIS_COMMAND_TIMEOUT || '5000', 10),
}));
