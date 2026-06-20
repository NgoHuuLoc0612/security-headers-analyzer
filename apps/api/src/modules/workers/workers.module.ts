// apps/api/src/modules/workers/workers.module.ts
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { IoWorker } from './io.worker';
import { CpuWorker } from './cpu.worker';
import { ApiWorker } from './api.worker';
import { ResultAggregatorWorker } from './result-aggregator.worker';
import { RuleEngineService } from './services/rule-engine.service';
import { ScoringService } from './services/scoring.service';
import { CSPAnalyzerService } from './services/csp-analyzer.service';
import { CookieAnalyzerService } from './services/cookie-analyzer.service';
import { QueueModule } from '../queue/queue.module';
import { QUEUE_NAMES } from '../queue/queue.constants';
import { AnalysisModule } from '../analysis/analysis.module';

@Module({
  imports: [
    QueueModule,
    AnalysisModule,
    BullModule.registerQueue(
      { name: QUEUE_NAMES.IO_WORKER },
      { name: QUEUE_NAMES.CPU_WORKER },
      { name: QUEUE_NAMES.API_WORKER },
      { name: QUEUE_NAMES.RESULT_AGGREGATOR },
      { name: QUEUE_NAMES.DLQ_IO },
      { name: QUEUE_NAMES.DLQ_CPU },
      { name: QUEUE_NAMES.DLQ_API },
    ),
  ],
  providers: [
    // Workers
    IoWorker,
    CpuWorker,
    ApiWorker,
    ResultAggregatorWorker,
    // Services
    RuleEngineService,
    ScoringService,
    CSPAnalyzerService,
    CookieAnalyzerService,
  ],
  exports: [RuleEngineService, ScoringService],
})
export class WorkersModule {}
