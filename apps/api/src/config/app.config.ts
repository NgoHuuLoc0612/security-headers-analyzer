// apps/api/src/config/app.config.ts
import { registerAs } from '@nestjs/config';

export const appConfig = registerAs('app', () => ({
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  jwtSecret: process.env.JWT_SECRET || 'sha-dev-secret-change-in-prod',
  maxClusterWorkers: parseInt(process.env.MAX_CLUSTER_WORKERS || '4', 10),
  enableCluster: process.env.ENABLE_CLUSTER === 'true',

  // External API keys
  sslLabsEmail: process.env.SSL_LABS_EMAIL || '',
  virusTotalApiKey: process.env.VIRUSTOTAL_API_KEY || '',

  // Analysis limits
  maxConcurrentAnalyses: parseInt(process.env.MAX_CONCURRENT_ANALYSES || '10', 10),
  analysisTimeoutMs: parseInt(process.env.ANALYSIS_TIMEOUT_MS || '60000', 10),
  maxRedirects: parseInt(process.env.MAX_REDIRECTS || '10', 10),

  // Cache TTLs (seconds)
  analysisCacheTtl: parseInt(process.env.ANALYSIS_CACHE_TTL || '3600', 10),
  resultsCacheTtl: parseInt(process.env.RESULTS_CACHE_TTL || '300', 10),

  // Queue backpressure
  maxQueueSize: parseInt(process.env.MAX_QUEUE_SIZE || '1000', 10),
  ioWorkerConcurrency: parseInt(process.env.IO_WORKER_CONCURRENCY || '20', 10),
  cpuWorkerConcurrency: parseInt(process.env.CPU_WORKER_CONCURRENCY || '4', 10),
  apiWorkerConcurrency: parseInt(process.env.API_WORKER_CONCURRENCY || '8', 10),

  // Retry config
  maxJobAttempts: parseInt(process.env.MAX_JOB_ATTEMPTS || '3', 10),
  retryBaseDelayMs: parseInt(process.env.RETRY_BASE_DELAY_MS || '2000', 10),
}));
