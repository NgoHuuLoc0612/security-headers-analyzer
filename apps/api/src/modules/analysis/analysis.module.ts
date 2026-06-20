// apps/api/src/modules/analysis/analysis.module.ts
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AnalysisController } from './analysis.controller';
import { AnalysisService } from './analysis.service';
import { QueueModule } from '../queue/queue.module';
import { QUEUE_NAMES } from '../queue/queue.constants';

@Module({
  imports: [
    QueueModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.ANALYSIS_ORCHESTRATOR }),
  ],
  controllers: [AnalysisController],
  providers: [AnalysisService],
  exports: [AnalysisService],
})
export class AnalysisModule {}
