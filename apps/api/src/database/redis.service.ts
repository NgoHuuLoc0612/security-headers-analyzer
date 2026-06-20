// apps/api/src/database/redis.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis, { RedisOptions } from 'ioredis';

type CacheDb = 'main' | 'cache' | 'session' | 'metrics';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private clients: Map<CacheDb, Redis> = new Map();

  constructor(private readonly config: ConfigService) {}

  private createClient(db: number, label: string): Redis {
    const options: RedisOptions = {
      host: this.config.get('REDIS_HOST', 'localhost'),
      port: this.config.get<number>('REDIS_PORT', 6379),
      password: this.config.get('REDIS_PASSWORD'),
      db,
      keyPrefix: `sha:`,
      lazyConnect: true,
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 100, 3000),
      reconnectOnError: (err) => {
        this.logger.warn(`Redis reconnect [${label}]: ${err.message}`);
        return true;
      },
    };

    const client = new Redis(options);
    client.on('connect', () => this.logger.log(`✅ Redis [${label}] connected (db:${db})`));
    client.on('error', (err) => this.logger.error(`Redis [${label}] error: ${err.message}`));
    client.on('close', () => this.logger.warn(`Redis [${label}] connection closed`));
    return client;
  }

  async onModuleInit() {
    const redisConfig = this.config.get('redis');

    this.clients.set('main', this.createClient(redisConfig.db, 'main'));
    this.clients.set('cache', this.createClient(redisConfig.cacheDb, 'cache'));
    this.clients.set('session', this.createClient(redisConfig.sessionDb, 'session'));
    this.clients.set('metrics', this.createClient(redisConfig.metricsDb, 'metrics'));

    await Promise.all(
      Array.from(this.clients.values()).map((c) => c.connect()),
    );
    this.logger.log('All Redis clients connected');
  }

  async onModuleDestroy() {
    await Promise.all(
      Array.from(this.clients.values()).map((c) => c.quit()),
    );
  }

  getClient(db: CacheDb = 'main'): Redis {
    const client = this.clients.get(db);
    if (!client) throw new Error(`Redis client '${db}' not found`);
    return client;
  }

  // ─── Cache Operations ─────────────────────────────────────
  async get<T>(key: string, db: CacheDb = 'cache'): Promise<T | null> {
    const raw = await this.getClient(db).get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as unknown as T;
    }
  }

  async set(
    key: string,
    value: unknown,
    ttlSeconds?: number,
    db: CacheDb = 'cache',
  ): Promise<void> {
    const client = this.getClient(db);
    const serialized = JSON.stringify(value);
    if (ttlSeconds) {
      await client.setex(key, ttlSeconds, serialized);
    } else {
      await client.set(key, serialized);
    }
  }

  async del(key: string, db: CacheDb = 'cache'): Promise<number> {
    return this.getClient(db).del(key);
  }

  async exists(key: string, db: CacheDb = 'cache'): Promise<boolean> {
    const count = await this.getClient(db).exists(key);
    return count > 0;
  }

  async expire(key: string, ttlSeconds: number, db: CacheDb = 'cache'): Promise<void> {
    await this.getClient(db).expire(key, ttlSeconds);
  }

  // ─── Hash Operations (job progress, metrics) ──────────────
  async hset(key: string, field: string, value: unknown, db: CacheDb = 'main'): Promise<void> {
    await this.getClient(db).hset(key, field, JSON.stringify(value));
  }

  async hget<T>(key: string, field: string, db: CacheDb = 'main'): Promise<T | null> {
    const raw = await this.getClient(db).hget(key, field);
    if (!raw) return null;
    try { return JSON.parse(raw) as T; } catch { return raw as unknown as T; }
  }

  async hgetall<T>(key: string, db: CacheDb = 'main'): Promise<Record<string, T> | null> {
    const raw = await this.getClient(db).hgetall(key);
    if (!raw) return null;
    const result: Record<string, T> = {};
    for (const [k, v] of Object.entries(raw)) {
      try { result[k] = JSON.parse(v) as T; } catch { result[k] = v as unknown as T; }
    }
    return result;
  }

  // ─── Sorted Set (timeline, leaderboard) ──────────────────
  async zadd(key: string, score: number, member: string, db: CacheDb = 'metrics'): Promise<void> {
    await this.getClient(db).zadd(key, score, member);
  }

  async zrange(key: string, start: number, stop: number, db: CacheDb = 'metrics'): Promise<string[]> {
    return this.getClient(db).zrange(key, start, stop);
  }

  async zrangebyscore(key: string, min: number, max: number, db: CacheDb = 'metrics'): Promise<string[]> {
    return this.getClient(db).zrangebyscore(key, min, max);
  }

  // ─── Pub/Sub (SSE fan-out) ────────────────────────────────
  async publish(channel: string, message: unknown): Promise<void> {
    const client = this.getClient('main');
    await client.publish(channel, JSON.stringify(message));
  }

  createSubscriber(): Redis {
    const client = this.createClient(
      this.config.get<number>('REDIS_DB', 0),
      'subscriber',
    );
    client.connect();
    return client;
  }

  // ─── Rate limiting ────────────────────────────────────────
  async incrementRateLimit(key: string, ttl: number, db: CacheDb = 'cache'): Promise<number> {
    const client = this.getClient(db);
    const pipe = client.pipeline();
    pipe.incr(key);
    pipe.expire(key, ttl);
    const results = await pipe.exec();
    return (results?.[0]?.[1] as number) || 0;
  }

  // ─── Idempotency key ─────────────────────────────────────
  async setIdempotencyKey(key: string, value: unknown, ttl = 86400): Promise<boolean> {
    const client = this.getClient('cache');
    const result = await client.set(
      `idem:${key}`,
      JSON.stringify(value),
      'EX', ttl,
      'NX', // Only set if not exists
    );
    return result === 'OK';
  }

  async getIdempotencyKey<T>(key: string): Promise<T | null> {
    return this.get<T>(`idem:${key}`, 'cache');
  }

  // ─── Queue backpressure metrics ───────────────────────────
  async getQueueDepth(queueName: string): Promise<number> {
    const key = `bull:${queueName}:wait`;
    return this.getClient('main').llen(key);
  }

  // ─── System health ────────────────────────────────────────
  async ping(): Promise<boolean> {
    try {
      const result = await this.getClient('main').ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  async getInfo(): Promise<Record<string, string>> {
    const raw = await this.getClient('main').info();
    const lines = raw.split('\r\n');
    const info: Record<string, string> = {};
    for (const line of lines) {
      if (line.includes(':')) {
        const [key, val] = line.split(':');
        info[key.trim()] = val.trim();
      }
    }
    return info;
  }
}
