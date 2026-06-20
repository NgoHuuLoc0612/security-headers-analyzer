// apps/api/src/modules/queue/queue.constants.ts

// Queue names
export const QUEUE_NAMES = {
  // Main orchestration queue
  ANALYSIS_ORCHESTRATOR: 'analysis-orchestrator',

  // Specialized worker queues
  IO_WORKER: 'worker-io',         // Network I/O (HTTP fetch, DNS)
  CPU_WORKER: 'worker-cpu',       // CPU-bound (rule engine, scoring)
  API_WORKER: 'worker-api',       // External API calls (SSL Labs, VT, RDAP)

  // Dead letter queues
  DLQ_IO: 'dlq-io',
  DLQ_CPU: 'dlq-cpu',
  DLQ_API: 'dlq-api',

  // Result aggregation
  RESULT_AGGREGATOR: 'result-aggregator',

  // Metrics collection
  METRICS_COLLECTOR: 'metrics-collector',
} as const;

// Job names within queues
export const JOB_NAMES = {
  // Orchestrator jobs
  ORCHESTRATE_ANALYSIS: 'orchestrate:analysis',
  FAN_OUT: 'fan:out',
  FAN_IN: 'fan:in',

  // IO worker jobs
  FETCH_HTTP: 'io:fetch_http',
  RESOLVE_DNS: 'io:resolve_dns',
  CHECK_REDIRECT_CHAIN: 'io:check_redirect_chain',

  // CPU worker jobs
  ANALYZE_HEADERS: 'cpu:analyze_headers',
  ANALYZE_CSP: 'cpu:analyze_csp',
  ANALYZE_COOKIES: 'cpu:analyze_cookies',
  CALCULATE_SCORE: 'cpu:calculate_score',
  RUN_RULE_ENGINE: 'cpu:run_rule_engine',

  // API worker jobs
  SSL_LABS_SCAN: 'api:ssl_labs',
  VIRUS_TOTAL_SCAN: 'api:virus_total',
  RDAP_LOOKUP: 'api:rdap',

  // Aggregation
  AGGREGATE_RESULTS: 'result:aggregate',
  PERSIST_RESULT: 'result:persist',

  // Metrics
  COLLECT_QUEUE_METRICS: 'metrics:queue',
  COLLECT_WORKER_METRICS: 'metrics:worker',
} as const;

// Queue priorities
export const JOB_PRIORITIES = {
  critical: 1,
  high: 10,
  normal: 20,
  low: 100,
} as const;

// Queue concurrency per worker type
export const WORKER_CONCURRENCY = {
  io: parseInt(process.env.IO_WORKER_CONCURRENCY || '20', 10),
  cpu: parseInt(process.env.CPU_WORKER_CONCURRENCY || '4', 10),
  api: parseInt(process.env.API_WORKER_CONCURRENCY || '8', 10),
} as const;

// Backpressure thresholds
export const BACKPRESSURE = {
  // Max jobs in waiting state before rejecting new submissions
  MAX_WAITING_IO: parseInt(process.env.MAX_WAITING_IO || '500', 10),
  MAX_WAITING_CPU: parseInt(process.env.MAX_WAITING_CPU || '200', 10),
  MAX_WAITING_API: parseInt(process.env.MAX_WAITING_API || '300', 10),

  // Warning thresholds (80%)
  WARN_WAITING_IO: 400,
  WARN_WAITING_CPU: 160,
  WARN_WAITING_API: 240,
} as const;

// Retry configuration
export const RETRY_CONFIG = {
  io: {
    attempts: 3,
    backoff: { type: 'exponential' as const, delay: 1000 },
  },
  cpu: {
    attempts: 2,
    backoff: { type: 'fixed' as const, delay: 500 },
  },
  api: {
    attempts: 4,
    backoff: { type: 'exponential' as const, delay: 5000 },
  },
} as const;

// Job TTLs
export const JOB_TTL = {
  removeOnComplete: { count: 1000, age: 86400 },     // 24h
  removeOnFail: { count: 500, age: 604800 },          // 7d
  dlqRemoveOnFail: { count: 2000, age: 2592000 },    // 30d
} as const;

// Stage → Queue mapping for fan-out pipeline
export const STAGE_QUEUE_MAP = {
  DNS_RESOLUTION: QUEUE_NAMES.IO_WORKER,
  TLS_HANDSHAKE: QUEUE_NAMES.IO_WORKER,
  HTTP_FETCH: QUEUE_NAMES.IO_WORKER,
  SSL_LABS: QUEUE_NAMES.API_WORKER,
  VIRUS_TOTAL: QUEUE_NAMES.API_WORKER,
  RDAP: QUEUE_NAMES.API_WORKER,
  RULE_ENGINE: QUEUE_NAMES.CPU_WORKER,
  SCORING: QUEUE_NAMES.CPU_WORKER,
} as const;
