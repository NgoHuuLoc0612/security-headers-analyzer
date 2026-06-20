// apps/api/src/modules/queue/job-orchestrator.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, Job, FlowProducer } from 'bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import {
  QUEUE_NAMES,
  JOB_NAMES,
  JOB_PRIORITIES,
  BACKPRESSURE,
  RETRY_CONFIG,
  JOB_TTL,
} from './queue.constants';
import { RedisService } from '../../database/redis.service';
import type { AnalysisRequestDto } from '../analysis/dto/analysis.schema';

export interface OrchestrationResult {
  jobId: string;
  correlationId: string;
  status: 'queued' | 'rejected';
  reason?: string;
  estimatedWait?: number;
}

export interface AnalysisJobData {
  correlationId: string;
  url: string;
  domain: string;
  options: AnalysisRequestDto['options'];
  submittedAt: string;
  priority: string;
}

export interface SubJobResult {
  correlationId: string;
  stage: string;
  data: unknown;
  duration: number;
  workerPid: number;
}

@Injectable()
export class JobOrchestratorService {
  private readonly logger = new Logger(JobOrchestratorService.name);
  private flowProducer: FlowProducer;

  constructor(
    @InjectQueue(QUEUE_NAMES.ANALYSIS_ORCHESTRATOR)
    private readonly orchestratorQueue: Queue,

    @InjectQueue(QUEUE_NAMES.IO_WORKER)
    private readonly ioQueue: Queue,

    @InjectQueue(QUEUE_NAMES.CPU_WORKER)
    private readonly cpuQueue: Queue,

    @InjectQueue(QUEUE_NAMES.API_WORKER)
    private readonly apiQueue: Queue,

    @InjectQueue(QUEUE_NAMES.RESULT_AGGREGATOR)
    private readonly aggregatorQueue: Queue,

    @InjectQueue(QUEUE_NAMES.DLQ_IO)
    private readonly dlqIo: Queue,

    @InjectQueue(QUEUE_NAMES.DLQ_CPU)
    private readonly dlqCpu: Queue,

    @InjectQueue(QUEUE_NAMES.DLQ_API)
    private readonly dlqApi: Queue,

    private readonly redis: RedisService,
    private readonly events: EventEmitter2,
    private readonly config: ConfigService,
  ) {
    // BullMQ FlowProducer for dependent job graphs
    const redisConnection = {
      host: config.get('REDIS_HOST', 'localhost'),
      port: config.get<number>('REDIS_PORT', 6379),
      password: config.get('REDIS_PASSWORD'),
    };
    this.flowProducer = new FlowProducer({ connection: redisConnection });
  }

  // ─── Submit new analysis job ───────────────────────────────
  async orchestrate(
    dto: AnalysisRequestDto,
    ipAddress?: string,
  ): Promise<OrchestrationResult> {
    const correlationId = uuidv4();

    // Backpressure check
    const backpressureCheck = await this.checkBackpressure();
    if (backpressureCheck.rejected) {
      this.logger.warn(`Backpressure: rejecting job for ${dto.url}`);
      return {
        jobId: '',
        correlationId,
        status: 'rejected',
        reason: backpressureCheck.reason,
        estimatedWait: backpressureCheck.estimatedWait,
      };
    }

    // Idempotency check (same URL within last 60s)
    const idemKey = `analysis:${Buffer.from(dto.url).toString('base64').substring(0, 32)}`;
    const existingResult = await this.redis.getIdempotencyKey(idemKey);
    if (existingResult) {
      this.logger.log(`Idempotent: returning cached job for ${dto.url}`);
      return existingResult as OrchestrationResult;
    }

    const domain = this.extractDomain(dto.url);
    const priority = JOB_PRIORITIES[dto.options?.priority || 'normal'];

    const jobData: AnalysisJobData = {
      correlationId,
      url: dto.url,
      domain,
      options: dto.options || {},
      submittedAt: new Date().toISOString(),
      priority: dto.options?.priority || 'normal',
    };

    // Fan-out: create dependent job graph via FlowProducer
    const flow = await this.flowProducer.add({
      name: JOB_NAMES.ORCHESTRATE_ANALYSIS,
      queueName: QUEUE_NAMES.ANALYSIS_ORCHESTRATOR,
      data: jobData,
      opts: {
        priority,
        jobId: `orch-${correlationId}`,
        ...RETRY_CONFIG.io,
        ...JOB_TTL,
      },
      // Child jobs — fan-out
      children: [
        // IO phase
        {
          name: JOB_NAMES.FETCH_HTTP,
          queueName: QUEUE_NAMES.IO_WORKER,
          data: { ...jobData, stage: 'HTTP_FETCH' },
          opts: {
            priority,
            jobId: `io-http-${correlationId}`,
            ...RETRY_CONFIG.io,
            ...JOB_TTL,
          },
          children: [
            // DNS runs in parallel with HTTP fetch
            {
              name: JOB_NAMES.RESOLVE_DNS,
              queueName: QUEUE_NAMES.IO_WORKER,
              data: { ...jobData, stage: 'DNS_RESOLUTION' },
              opts: {
                priority,
                jobId: `io-dns-${correlationId}`,
                ...RETRY_CONFIG.io,
              },
            },
          ],
        },
        // API phase (parallel) — these are enrichment data, not core to the
        // analysis. failParentOnFailure: false means if SSL Labs/VirusTotal/
        // RDAP exhausts its retries and lands in the DLQ, the parent job
        // still becomes "ready" and the pipeline completes with that one
        // field as null instead of hanging forever.
        ...(dto.options?.includeSSLGrade !== false
          ? [{
              name: JOB_NAMES.SSL_LABS_SCAN,
              queueName: QUEUE_NAMES.API_WORKER,
              data: { ...jobData, stage: 'SSL_LABS' },
              opts: {
                priority,
                jobId: `api-ssl-${correlationId}`,
                ...RETRY_CONFIG.api,
                ignoreDependencyOnFailure: true,
              },
            }]
          : []),
        ...(dto.options?.includeVirusTotal !== false
          ? [{
              name: JOB_NAMES.VIRUS_TOTAL_SCAN,
              queueName: QUEUE_NAMES.API_WORKER,
              data: { ...jobData, stage: 'VIRUS_TOTAL' },
              opts: {
                priority,
                jobId: `api-vt-${correlationId}`,
                ...RETRY_CONFIG.api,
                ignoreDependencyOnFailure: true,
              },
            }]
          : []),
        ...(dto.options?.includeRDAP !== false
          ? [{
              name: JOB_NAMES.RDAP_LOOKUP,
              queueName: QUEUE_NAMES.API_WORKER,
              data: { ...jobData, stage: 'RDAP' },
              opts: {
                priority,
                jobId: `api-rdap-${correlationId}`,
                ...RETRY_CONFIG.api,
                ignoreDependencyOnFailure: true,
              },
            }]
          : []),
      ],
    });

    const mainJobId = flow.job.id || `orch:${correlationId}`;

    const result: OrchestrationResult = {
      jobId: mainJobId,
      correlationId,
      status: 'queued',
      estimatedWait: await this.estimateWait(priority),
    };

    // Store idempotency key (60s window)
    await this.redis.setIdempotencyKey(idemKey, result, 60);

    // Track job in Redis
    await this.redis.set(
      `job:meta:${correlationId}`,
      {
        jobId: mainJobId,
        correlationId,
        url: dto.url,
        domain,
        status: 'queued',
        progress: 0,
        stage: 'QUEUED',
        submittedAt: new Date().toISOString(),
        attempts: 0,
      },
      3600, // 1h TTL
    );

    // Emit event
    this.events.emit('job:created', { correlationId, url: dto.url, jobId: mainJobId });

    this.logger.log(
      `✅ Analysis queued: ${correlationId} | URL: ${dto.url} | Priority: ${dto.options?.priority}`,
    );

    return result;
  }

  // ─── Bulk orchestration ─────────────────────────────────────
  async orchestrateBulk(
    urls: string[],
    options: AnalysisRequestDto['options'],
  ): Promise<OrchestrationResult[]> {
    const results = await Promise.allSettled(
      urls.map((url) => this.orchestrate({ url, options })),
    );

    return results.map((r, i) => {
      if (r.status === 'fulfilled') return r.value;
      return {
        jobId: '',
        correlationId: uuidv4(),
        status: 'rejected' as const,
        reason: r.reason?.message || 'Unknown error',
      };
    });
  }

  // ─── Move job to DLQ ──────────────────────────────────────
  async moveToDLQ(job: Job, queueType: 'io' | 'cpu' | 'api', error: Error): Promise<void> {
    const dlqMap = {
      io: this.dlqIo,
      cpu: this.dlqCpu,
      api: this.dlqApi,
    };
    const dlq = dlqMap[queueType];

    await dlq.add(
      `dlq:${job.name}`,
      {
        originalJob: job.data,
        originalJobId: job.id,
        originalQueue: job.queueName,
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name,
        },
        failedAt: new Date().toISOString(),
        attempts: job.attemptsMade,
      },
      {
        jobId: `dlq-${job.id}`,
        removeOnFail: { count: 2000, age: 2592000 }, // 30d
        removeOnComplete: false,
      },
    );

    this.logger.warn(
      `Job ${job.id} moved to DLQ [${queueType}]: ${error.message}`,
    );
  }

  // ─── Backpressure check ───────────────────────────────────
  private async checkBackpressure(): Promise<{
    rejected: boolean;
    reason?: string;
    estimatedWait?: number;
  }> {
    const [ioWaiting, cpuWaiting, apiWaiting] = await Promise.all([
      this.ioQueue.getWaitingCount(),
      this.cpuQueue.getWaitingCount(),
      this.apiQueue.getWaitingCount(),
    ]);

    if (ioWaiting >= BACKPRESSURE.MAX_WAITING_IO) {
      return {
        rejected: true,
        reason: `IO queue at capacity (${ioWaiting}/${BACKPRESSURE.MAX_WAITING_IO})`,
        estimatedWait: Math.ceil(ioWaiting / 10) * 1000,
      };
    }
    if (cpuWaiting >= BACKPRESSURE.MAX_WAITING_CPU) {
      return {
        rejected: true,
        reason: `CPU queue at capacity (${cpuWaiting}/${BACKPRESSURE.MAX_WAITING_CPU})`,
      };
    }
    if (apiWaiting >= BACKPRESSURE.MAX_WAITING_API) {
      return {
        rejected: true,
        reason: `API queue at capacity (${apiWaiting}/${BACKPRESSURE.MAX_WAITING_API})`,
      };
    }

    return { rejected: false };
  }

  // ─── Estimate wait time ────────────────────────────────────
  private async estimateWait(priority: number): Promise<number> {
    const waiting = await this.orchestratorQueue.getWaitingCount();
    // Rough estimate: 5s per job in queue at normal priority
    return Math.ceil((waiting / (BACKPRESSURE.MAX_WAITING_IO / 100)) * 5000);
  }

  // ─── Update job progress in Redis ─────────────────────────
  async updateProgress(
    correlationId: string,
    stage: string,
    progress: number,
    extra?: Record<string, unknown>,
  ): Promise<void> {
    const key = `job:meta:${correlationId}`;
    const existing = await this.redis.get<Record<string, unknown>>(key);
    await this.redis.set(
      key,
      {
        ...(existing || {}),
        stage,
        progress,
        updatedAt: new Date().toISOString(),
        ...extra,
      },
      3600,
    );
    this.events.emit('job:progress', { correlationId, stage, progress, ...extra });
  }

  // ─── Get job meta from Redis ──────────────────────────────
  async getJobMeta(correlationId: string): Promise<Record<string, unknown> | null> {
    return this.redis.get(`job:meta:${correlationId}`);
  }

  // ─── Cancel job ───────────────────────────────────────────
  async cancelJob(jobId: string): Promise<boolean> {
    const queues = [
      this.orchestratorQueue,
      this.ioQueue,
      this.cpuQueue,
      this.apiQueue,
    ];

    for (const queue of queues) {
      const job = await queue.getJob(jobId);
      if (job) {
        await job.remove();
        return true;
      }
    }
    return false;
  }

  // ─── Queue metrics ────────────────────────────────────────
  async getQueueMetrics() {
    const [orch, io, cpu, api] = await Promise.all([
      this.getQueueStats(this.orchestratorQueue, 'orchestrator'),
      this.getQueueStats(this.ioQueue, 'io'),
      this.getQueueStats(this.cpuQueue, 'cpu'),
      this.getQueueStats(this.apiQueue, 'api'),
    ]);
    return { orch, io, cpu, api };
  }

  private async getQueueStats(queue: Queue, name: string) {
    const [waiting, active, completed, failed, delayed, paused] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
      queue.isPaused(),
    ]);
    return { name, waiting, active, completed, failed, delayed, paused };
  }

  private extractDomain(url: string): string {
    try {
      const u = new URL(url.startsWith('http') ? url : `https://${url}`);
      return u.hostname;
    } catch {
      return url;
    }
  }
}
