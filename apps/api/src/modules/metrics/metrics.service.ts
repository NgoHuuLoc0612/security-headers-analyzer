// apps/api/src/modules/metrics/metrics.service.ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { collectDefaultMetrics, Counter, Histogram, Gauge, Registry } from 'prom-client';

@Injectable()
export class MetricsService implements OnModuleInit {
  private readonly registry = new Registry();

  // Counters
  readonly analysisTotal = new Counter({
    name: 'sha_analysis_total',
    help: 'Total number of analyses submitted',
    labelNames: ['status', 'priority'],
    registers: [this.registry],
  });

  readonly analysisErrors = new Counter({
    name: 'sha_analysis_errors_total',
    help: 'Total analysis errors',
    labelNames: ['stage', 'worker_type'],
    registers: [this.registry],
  });

  readonly jobsProcessed = new Counter({
    name: 'sha_jobs_processed_total',
    help: 'Total BullMQ jobs processed',
    labelNames: ['queue', 'status'],
    registers: [this.registry],
  });

  // Histograms
  readonly analysisDuration = new Histogram({
    name: 'sha_analysis_duration_seconds',
    help: 'Analysis duration in seconds',
    buckets: [1, 5, 10, 30, 60, 120, 300],
    labelNames: ['grade'],
    registers: [this.registry],
  });

  readonly httpFetchDuration = new Histogram({
    name: 'sha_http_fetch_duration_seconds',
    help: 'HTTP fetch duration',
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
    registers: [this.registry],
  });

  readonly externalApiDuration = new Histogram({
    name: 'sha_external_api_duration_seconds',
    help: 'External API call duration',
    labelNames: ['api'],
    buckets: [1, 5, 10, 30, 60, 120],
    registers: [this.registry],
  });

  // Gauges
  readonly queueDepth = new Gauge({
    name: 'sha_queue_depth',
    help: 'Current queue depth',
    labelNames: ['queue', 'state'],
    registers: [this.registry],
  });

  readonly activeWorkers = new Gauge({
    name: 'sha_active_workers',
    help: 'Number of active workers',
    labelNames: ['type'],
    registers: [this.registry],
  });

  readonly scoreDistribution = new Histogram({
    name: 'sha_score_distribution',
    help: 'Distribution of security scores',
    buckets: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
    registers: [this.registry],
  });

  onModuleInit() {
    collectDefaultMetrics({ register: this.registry });
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  getContentType(): string {
    return this.registry.contentType;
  }
}

// ─── Metrics Controller ───────────────────────────────────────
// apps/api/src/modules/metrics/metrics.controller.ts
