// apps/api/src/modules/queue/queue.module.ts
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from './queue.constants';
import { JobOrchestratorService } from './job-orchestrator.service';
import { QueueController } from './queue.controller';
import { OrchestratorWorker } from './orchestrator.worker';

const queues = Object.values(QUEUE_NAMES).map((name) => ({
  name,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { count: 1000, age: 86400 },
    removeOnFail: { count: 500, age: 604800 },
  },
}));

@Module({
  imports: [BullModule.registerQueue(...queues)],
  controllers: [QueueController],
  providers: [JobOrchestratorService, OrchestratorWorker],
  exports: [JobOrchestratorService, BullModule],
})
export class QueueModule {}
