// apps/api/src/database/prisma.service.ts
import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient, Prisma } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(private readonly config: ConfigService) {
    super({
      datasources: {
        db: { url: config.get<string>('DATABASE_URL') },
      },
      log: [
        { level: 'query', emit: 'event' },
        { level: 'error', emit: 'event' },
        { level: 'warn', emit: 'event' },
        { level: 'info', emit: 'event' },
      ],
      // EDB PostgreSQL native optimizations
      transactionOptions: {
        maxWait: 5000,
        timeout: 30000,
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      },
    });

    // Log slow queries
    (this as any).$on('query', (e: Prisma.QueryEvent) => {
      if (e.duration > 500) {
        this.logger.warn(`Slow query (${e.duration}ms): ${e.query.substring(0, 120)}...`);
      }
    });

    (this as any).$on('error', (e: Prisma.LogEvent) => {
      this.logger.error(`Prisma error: ${e.message}`);
    });
  }

  async onModuleInit() {
    try {
      await this.$connect();
      // EDB-specific: set statement_timeout
      await this.$executeRaw`SET statement_timeout = '30s'`;
      await this.$executeRaw`SET lock_timeout = '10s'`;
      await this.$executeRaw`SET idle_in_transaction_session_timeout = '60s'`;
      this.logger.log('✅ PostgreSQL (EDB) connected');

      // Verify extensions
      const extensions = await this.$queryRaw<Array<{ extname: string }>>`
        SELECT extname FROM pg_extension WHERE extname IN ('uuid-ossp', 'pg_trgm', 'btree_gin')
      `;
      this.logger.log(
        `Extensions loaded: ${extensions.map((e) => e.extname).join(', ')}`,
      );
    } catch (error) {
      this.logger.error('Failed to connect to PostgreSQL:', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('PostgreSQL disconnected');
  }

  // Helper: soft pagination
  async paginatedQuery<T>(
    model: string,
    where: Record<string, unknown>,
    orderBy: Record<string, unknown>,
    page = 1,
    limit = 20,
  ): Promise<{ data: T[]; total: number; page: number; pages: number }> {
    const skip = (page - 1) * limit;
    const [data, total] = await (this as any)[model].findManyAndCount({
      where,
      orderBy,
      skip,
      take: limit,
    });
    return { data, total, page, pages: Math.ceil(total / limit) };
  }

  // Helper: upsert with conflict handling
  async safeUpsert<T>(
    model: keyof PrismaClient,
    where: Record<string, unknown>,
    create: Record<string, unknown>,
    update: Record<string, unknown>,
  ): Promise<T> {
    return (this as any)[model].upsert({ where, create, update });
  }

  // Metrics query
  async getAnalysisStats() {
    const [total, byGrade, avgScore, last24h] = await Promise.all([
      this.analysis.count(),
      this.analysis.groupBy({
        by: ['grade'],
        _count: { grade: true },
        orderBy: { grade: 'asc' },
      }),
      this.analysis.aggregate({
        _avg: { overallScore: true },
        _min: { overallScore: true },
        _max: { overallScore: true },
      }),
      this.analysis.count({
        where: {
          analyzedAt: { gte: new Date(Date.now() - 86400000) },
        },
      }),
    ]);

    return { total, byGrade, avgScore, last24h };
  }
}
