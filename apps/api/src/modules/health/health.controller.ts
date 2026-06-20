// apps/api/src/modules/health/health.controller.ts
import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, MemoryHealthIndicator, DiskHealthIndicator } from '@nestjs/terminus';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../../database/redis.service';

@ApiTags('health')
@Controller({ version: '1', path: 'health' })
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly memory: MemoryHealthIndicator,
    private readonly disk: DiskHealthIndicator,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Full health check' })
  async check() {
    return this.health.check([
      // Memory
      () => this.memory.checkHeap('memory_heap', 512 * 1024 * 1024), // 512MB
      () => this.memory.checkRSS('memory_rss', 1024 * 1024 * 1024), // 1GB

      // Disk
      () => this.disk.checkStorage('disk', { path: '/', thresholdPercent: 0.9 }),

      // PostgreSQL
      async () => {
        try {
          await this.prisma.$queryRaw`SELECT 1`;
          return { postgresql: { status: 'up' } };
        } catch (e) {
          return { postgresql: { status: 'down', error: (e as Error).message } };
        }
      },

      // Redis
      async () => {
        const healthy = await this.redis.ping();
        return { redis: { status: healthy ? 'up' : 'down' } };
      },
    ]);
  }

  @Get('live')
  @ApiOperation({ summary: 'Liveness probe' })
  live() {
    return { status: 'ok', pid: process.pid, uptime: process.uptime() };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe' })
  async ready() {
    const [dbOk, redisOk] = await Promise.allSettled([
      this.prisma.$queryRaw`SELECT 1`,
      this.redis.ping(),
    ]);

    const ready = dbOk.status === 'fulfilled' && redisOk.status === 'fulfilled';
    return {
      status: ready ? 'ready' : 'not_ready',
      db: dbOk.status === 'fulfilled' ? 'up' : 'down',
      redis: redisOk.status === 'fulfilled' ? 'up' : 'down',
    };
  }
}
