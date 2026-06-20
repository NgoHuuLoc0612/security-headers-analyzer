// apps/api/src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule } from '@nestjs/throttler';
import { TerminusModule } from '@nestjs/terminus';
import { BullModule } from '@nestjs/bullmq';
import { AnalysisModule } from './modules/analysis/analysis.module';
import { QueueModule } from './modules/queue/queue.module';
import { WorkersModule } from './modules/workers/workers.module';
import { MetricsModule } from './modules/metrics/metrics.module';
import { HealthModule } from './modules/health/health.module';
import { WebsocketModule } from './modules/websocket/websocket.module';
import { DatabaseModule } from './database/database.module';
import { appConfig } from './config/app.config';
import { redisConfig } from './config/redis.config';

@Module({
  imports: [
    // Config
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, redisConfig],
      envFilePath: ['.env.local', '.env'],
    }),

    // Event bus (fan-out)
    EventEmitterModule.forRoot({
      wildcard: true,
      delimiter: ':',
      maxListeners: 100,
      verboseMemoryLeak: true,
    }),

    // Rate limiting
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ([
        {
          name: 'short',
          ttl: 1000,
          limit: config.get('THROTTLE_SHORT_LIMIT', 10),
        },
        {
          name: 'medium',
          ttl: 10000,
          limit: config.get('THROTTLE_MEDIUM_LIMIT', 50),
        },
        {
          name: 'long',
          ttl: 60000,
          limit: config.get('THROTTLE_LONG_LIMIT', 200),
        },
      ]),
      inject: [ConfigService],
    }),

    // BullMQ (Redis queue)
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
          password: config.get('REDIS_PASSWORD'),
          db: config.get<number>('REDIS_DB', 0),
          maxRetriesPerRequest: 3,
          enableReadyCheck: false,
          lazyConnect: true,
        },
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
          removeOnComplete: { count: 1000, age: 86400 },
          removeOnFail: { count: 500, age: 604800 },
        },
      }),
      inject: [ConfigService],
    }),

    // Core modules
    DatabaseModule,
    AnalysisModule,
    QueueModule,
    WorkersModule,
    MetricsModule,
    HealthModule,
    WebsocketModule,
  ],
})
export class AppModule {}
