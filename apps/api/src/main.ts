// apps/api/src/main.ts
// Cluster-level horizontal scaling — 1 master + N workers
//
// IMPORTANT: the cluster.isPrimary check below runs at module load time,
// BEFORE NestJS's ConfigModule (which only loads .env once bootstrap()
// calls NestFactory.create()) has a chance to populate process.env.
// We must load .env manually, first thing, so ENABLE_CLUSTER and
// MAX_CLUSTER_WORKERS are available for that early check.
// process.cwd() is used (not __dirname) since both `ts-node-dev src/main.ts`
// and `node dist/.../main.js` are invoked from the apps/api/ working
// directory — this stays correct regardless of the build output layout.
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import cluster from 'cluster';
import { cpus } from 'os';

// NOTE: Node.js built-in `cluster` module export shape can differ between
// CJS/ESM interop modes depending on the runner (tsc, ts-node, ts-node-dev).
const clusterModule = (cluster as any)?.isPrimary !== undefined ? cluster : require('cluster');
const helmet = require('helmet');
const compression = require('compression');

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';
import { ConfigService } from '@nestjs/config';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { ZodValidationPipe } from './common/pipes/zod-validation.pipe';

const numCPUs = cpus().length;
const WORKERS = Math.min(numCPUs, parseInt(process.env.MAX_CLUSTER_WORKERS || '4', 10));

// ─── Logger Factory ───────────────────────────────────────────
function createLogger() {
  return WinstonModule.createLogger({
    transports: [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
          winston.format.printf(({ timestamp, level, message, context, ...meta }) => {
            const pid = process.pid;
            const ctx = context ? `[${context}]` : '';
            const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
            return `${timestamp} [SHA:${pid}] ${level} ${ctx} ${message}${metaStr}`;
          }),
        ),
      }),
      new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error',
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json(),
        ),
      }),
      new winston.transports.File({
        filename: 'logs/combined.log',
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json(),
        ),
      }),
    ],
  });
}

// ─── Bootstrap Single Worker ─────────────────────────────────
async function bootstrap() {
  const logger = createLogger();

  const app = await NestFactory.create(AppModule, {
    logger,
    bufferLogs: true,
  });

  const config = app.get(ConfigService);
  const port = config.get<number>('PORT', 3001);
  const isProd = config.get('NODE_ENV') === 'production';

  // Security
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", 'ws:', 'wss:'],
      },
    },
    crossOriginEmbedderPolicy: false,
  }));
  app.use(compression());

  // CORS
  app.enableCors({
    origin: config.get('CORS_ORIGIN', 'http://localhost:3000'),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-ID', 'X-Request-ID'],
    exposedHeaders: ['X-Total-Count', 'X-Correlation-ID'],
  });

  // Versioning
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.setGlobalPrefix('api');

  // Global pipes, filters, interceptors
  app.useGlobalPipes(new ZodValidationPipe());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(
    new TransformInterceptor(),
    new LoggingInterceptor(),
  );

  // WebSocket
  app.useWebSocketAdapter(new IoAdapter(app));

  // Swagger
  if (!isProd) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Security Headers Analyzer API')
      .setDescription('Security headers analysis pipeline')
      .setVersion('1.0')
      .addBearerAuth()
      .addTag('analysis', 'Header analysis endpoints')
      .addTag('queue', 'BullMQ queue management')
      .addTag('metrics', 'Prometheus metrics')
      .addTag('health', 'Health checks')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  await app.listen(port);

  logger.log(`🚀 SHA API [PID:${process.pid}] running on :${port}`, 'Bootstrap');
  logger.log(`📊 Cluster worker ${process.env.WORKER_ID || '0'}`, 'Bootstrap');
}

// ─── Cluster Manager (Master Process) ────────────────────────
if (clusterModule.isPrimary && process.env.ENABLE_CLUSTER === 'true') {
  console.log(`[SHA Master PID:${process.pid}] Spawning ${WORKERS} API workers`);

  for (let i = 0; i < WORKERS; i++) {
    const worker = clusterModule.fork({ WORKER_ID: String(i) });
    console.log(`[SHA Master] Worker ${i} spawned PID:${worker.process.pid}`);
  }

  clusterModule.on('exit', (worker, code, signal) => {
    console.log(
      `[SHA Master] Worker PID:${worker.process.pid} died (${signal || code}). Restarting...`,
    );
    const newWorker = clusterModule.fork({ WORKER_ID: worker.id });
    console.log(`[SHA Master] Replacement worker spawned PID:${newWorker.process.pid}`);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('[SHA Master] SIGTERM received, shutting down gracefully...');
    for (const id in clusterModule.workers) {
      clusterModule.workers[id]?.kill('SIGTERM');
    }
    setTimeout(() => process.exit(0), 5000);
  });
} else {
  bootstrap().catch((err) => {
    console.error('Fatal bootstrap error:', err);
    process.exit(1);
  });
}
