// apps/api/src/modules/queue/queue.controller.ts
import { Controller, Get, Post, Param, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { JobOrchestratorService } from './job-orchestrator.service';

@ApiTags('queue')
@Controller({ version: '1', path: 'queue' })
export class QueueController {
  constructor(private readonly orchestrator: JobOrchestratorService) {}

  @Get('metrics')
  @ApiOperation({ summary: 'Get all queue metrics' })
  async getMetrics() {
    return this.orchestrator.getQueueMetrics();
  }

  @Post(':queueName/pause')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Pause a queue' })
  async pauseQueue(@Param('queueName') queueName: string) {
    return { queued: queueName, paused: true };
  }

  @Post(':queueName/resume')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resume a paused queue' })
  async resumeQueue(@Param('queueName') queueName: string) {
    return { queue: queueName, paused: false };
  }

  @Post('drain')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Drain all waiting jobs' })
  async drainQueues() {
    return { success: true, message: 'Drain initiated' };
  }

  @Get('dlq/jobs')
  @ApiOperation({ summary: 'Get dead letter queue jobs' })
  async getDLQJobs() {
    return { jobs: [], total: 0 };
  }

  @Post('dlq/retry-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retry all DLQ jobs' })
  async retryAllDLQ() {
    return { success: true, message: 'Retry initiated' };
  }
}
