// apps/api/src/modules/queue/orchestrator.worker.ts
import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { QUEUE_NAMES, JOB_NAMES, JOB_TTL } from './queue.constants';
import type { AnalysisJobData } from './job-orchestrator.service';

/**
 * Processes the parent "orchestrate:analysis" job once BullMQ marks it
 * ready to run — which, in a FlowProducer graph, only happens after ALL
 * child jobs (IO fetch, DNS, SSL Labs, VirusTotal, RDAP) have completed.
 *
 * This is the fan-in trigger: it hands off to the Result Aggregator queue,
 * which actually reads the children's cached results from Redis and
 * persists the final analysis.
 */
@Processor(QUEUE_NAMES.ANALYSIS_ORCHESTRATOR, { concurrency: 10 })
export class OrchestratorWorker extends WorkerHost {
  private readonly logger = new Logger(`OrchestratorWorker[PID:${process.pid}]`);

  constructor(
    @InjectQueue(QUEUE_NAMES.RESULT_AGGREGATOR)
    private readonly aggregatorQueue: Queue,
  ) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    const jobData = job.data as AnalysisJobData;

    this.logger.log(
      `Parent job ready (all children completed): ${jobData.correlationId} — handing off to aggregator`,
    );

    // Enqueue the fan-in aggregation job
    await this.aggregatorQueue.add(
      JOB_NAMES.AGGREGATE_RESULTS,
      jobData,
      {
        jobId: `agg-${jobData.correlationId}`,
        ...JOB_TTL,
      },
    );

    return { handedOffToAggregator: true, correlationId: jobData.correlationId };
  }
}
