// apps/api/src/modules/metrics/metrics.controller.ts
import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { MetricsService } from './metrics.service';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { JobOrchestratorService } from '../queue/job-orchestrator.service';

@ApiTags('metrics')
@Controller({ version: '1', path: 'metrics' })
export class MetricsController {
  constructor(
    private readonly metrics: MetricsService,
    private readonly orchestrator: JobOrchestratorService,
  ) {}

  @Get('prometheus')
  @ApiOperation({ summary: 'Prometheus metrics endpoint' })
  async prometheus(@Res() res: Response) {
    res.setHeader('Content-Type', this.metrics.getContentType());
    res.send(await this.metrics.getMetrics());
  }

  @Get('queue')
  @ApiOperation({ summary: 'Queue-specific metrics' })
  async queueMetrics() {
    return this.orchestrator.getQueueMetrics();
  }

  @Get('system')
  @ApiOperation({ summary: 'System resource metrics' })
  system() {
    const mem = process.memoryUsage();
    return {
      pid: process.pid,
      uptime: process.uptime(),
      memory: {
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
        rss: mem.rss,
        external: mem.external,
        heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
        rssMB: Math.round(mem.rss / 1024 / 1024),
      },
      cpu: process.cpuUsage(),
      nodeVersion: process.version,
      platform: process.platform,
    };
  }
}
