// apps/api/src/modules/analysis/analysis.service.ts
import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Observable, Subject } from 'rxjs';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../../database/redis.service';
import { JobOrchestratorService } from '../queue/job-orchestrator.service';
import type {
  AnalysisRequestDto,
  BulkAnalysisDto,
  PaginationQueryDto,
  TrendQueryDto,
} from './dto/analysis.schema';
import type { AnalysisResult, TrendData } from '@sha/types';

@Injectable()
export class AnalysisService {
  private readonly logger = new Logger(AnalysisService.name);
  private readonly sseSubjects = new Map<string, Subject<any>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly orchestrator: JobOrchestratorService,
    private readonly events: EventEmitter2,
  ) {
    // Listen to each job event explicitly and fan-out to SSE subjects
    const forwardToSSE = (type: string) => (payload: any) => {
      const correlationId = payload?.correlationId;
      if (correlationId && this.sseSubjects.has(correlationId)) {
        this.sseSubjects.get(correlationId)?.next({ type, data: payload });
      }
    };
    this.events.on('job:created', forwardToSSE('job:created'));
    this.events.on('job:progress', forwardToSSE('job:progress'));
    this.events.on('job:completed', forwardToSSE('job:completed'));
    this.events.on('job:failed', forwardToSSE('job:failed'));

    this.events.on('job:completed', async (payload: any) => {
      // When job completes, close SSE stream
      setTimeout(() => {
        const subj = this.sseSubjects.get(payload?.correlationId);
        if (subj) {
          subj.complete();
          this.sseSubjects.delete(payload?.correlationId);
        }
      }, 2000);
    });
  }

  // ─── Submit single analysis ──────────────────────────────
  async submitAnalysis(dto: AnalysisRequestDto) {
    const result = await this.orchestrator.orchestrate(dto);

    return {
      success: result.status === 'queued',
      jobId: result.jobId,
      correlationId: result.correlationId,
      status: result.status,
      reason: result.reason,
      estimatedWaitMs: result.estimatedWait,
      streamUrl: `/api/v1/analysis/stream/${result.correlationId}`,
      pollUrl: `/api/v1/analysis/correlation/${result.correlationId}`,
    };
  }

  // ─── Submit bulk ─────────────────────────────────────────
  async submitBulkAnalysis(dto: BulkAnalysisDto) {
    const results = await this.orchestrator.orchestrateBulk(
      dto.urls,
      dto.options,
    );

    return {
      total: dto.urls.length,
      queued: results.filter((r) => r.status === 'queued').length,
      rejected: results.filter((r) => r.status === 'rejected').length,
      jobs: results,
    };
  }

  // ─── SSE stream ──────────────────────────────────────────
  getProgressStream(correlationId: string): Observable<any> {
    if (!this.sseSubjects.has(correlationId)) {
      this.sseSubjects.set(correlationId, new Subject());
    }

    const subject = this.sseSubjects.get(correlationId)!;

    return new Observable((observer) => {
      // Immediately emit current job meta
      this.redis.get(`job:meta:${correlationId}`).then((meta) => {
        if (meta) {
          observer.next({ data: JSON.stringify({ type: 'job:status', data: meta }) });
        }
      });

      const sub = subject.subscribe({
        next: (val) => observer.next({ data: JSON.stringify(val) }),
        error: (err) => observer.error(err),
        complete: () => observer.complete(),
      });

      // Heartbeat every 15s
      const heartbeat = setInterval(() => {
        observer.next({ data: JSON.stringify({ type: 'heartbeat', ts: Date.now() }) });
      }, 15000);

      return () => {
        sub.unsubscribe();
        clearInterval(heartbeat);
      };
    });
  }

  // ─── Get by ID ───────────────────────────────────────────
  async getAnalysisById(id: string): Promise<AnalysisResult> {
    // Check Redis cache first
    const cached = await this.redis.get<AnalysisResult>(`result:${id}`, 'cache');
    if (cached) return cached;

    const analysis = await this.prisma.analysis.findUnique({
      where: { id },
      include: {
        headers: true,
        cookies: true,
        improvements: { orderBy: { priority: 'asc' } },
        compliance: true,
        dnsScan: true,
        jobLog: true,
      },
    });

    if (!analysis) throw new NotFoundException(`Analysis ${id} not found`);

    const result = this.mapAnalysisToResult(analysis);

    // Cache for 5 minutes
    await this.redis.set(`result:${id}`, result, 300, 'cache');

    return result;
  }

  // ─── Get by correlation ID ───────────────────────────────
  async getByCorrelationId(correlationId: string) {
    // Check job meta in Redis first
    const jobMeta = await this.orchestrator.getJobMeta(correlationId);

    const analysis = await this.prisma.analysis.findUnique({
      where: { correlationId },
      include: {
        headers: { orderBy: { severity: 'asc' } },
        cookies: true,
        improvements: { orderBy: { priority: 'asc' }, take: 10 },
        compliance: true,
        dnsScan: true,
        jobLog: true,
      },
    });

    if (!analysis) {
      return {
        correlationId,
        status: jobMeta?.status || 'not_found',
        jobMeta,
        result: null,
      };
    }

    return {
      correlationId,
      status: 'completed',
      jobMeta,
      result: this.mapAnalysisToResult(analysis),
    };
  }

  // ─── List analyses ───────────────────────────────────────
  async listAnalyses(query: PaginationQueryDto) {
    const where: any = {};

    if (query.domain) where.domain = { contains: query.domain, mode: 'insensitive' };
    if (query.grade) where.grade = query.grade;
    if (query.minScore !== undefined) where.overallScore = { gte: query.minScore };
    if (query.maxScore !== undefined) {
      where.overallScore = { ...(where.overallScore || {}), lte: query.maxScore };
    }
    if (query.startDate) where.analyzedAt = { gte: new Date(query.startDate) };
    if (query.endDate) {
      where.analyzedAt = { ...(where.analyzedAt || {}), lte: new Date(query.endDate) };
    }

    const [analyses, total] = await Promise.all([
      this.prisma.analysis.findMany({
        where,
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: {
          id: true,
          url: true,
          domain: true,
          grade: true,
          overallScore: true,
          tlsGrade: true,
          analyzedAt: true,
          duration: true,
          http2Enabled: true,
          vtMalicious: true,
          hstsEnabled: true,
        },
      }),
      this.prisma.analysis.count({ where }),
    ]);

    return {
      data: analyses,
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        pages: Math.ceil(total / query.limit),
      },
    };
  }

  // ─── Domain history ──────────────────────────────────────
  async getDomainHistory(domain: string, limit: number) {
    const analyses = await this.prisma.analysis.findMany({
      where: { domain: { contains: domain, mode: 'insensitive' } },
      orderBy: { analyzedAt: 'desc' },
      take: Math.min(limit, 100),
      select: {
        id: true,
        url: true,
        grade: true,
        overallScore: true,
        headersScore: true,
        tlsScore: true,
        analyzedAt: true,
        duration: true,
      },
    });

    return { domain, analyses, total: analyses.length };
  }

  // ─── Trend ───────────────────────────────────────────────
  async getDomainTrend(query: TrendQueryDto): Promise<TrendData> {
    const since = new Date(Date.now() - query.days * 86400000);

    const dataPoints = await this.prisma.analysis.findMany({
      where: {
        domain: { contains: query.domain, mode: 'insensitive' },
        analyzedAt: { gte: since },
      },
      orderBy: { analyzedAt: 'asc' },
      select: {
        analyzedAt: true,
        overallScore: true,
        grade: true,
        url: true,
      },
    });

    const points = dataPoints.map((d) => ({
      timestamp: d.analyzedAt.toISOString(),
      score: d.overallScore || 0,
      grade: (d.grade || 'F') as any,
      url: d.url,
    }));

    let trend: TrendData['trend'] = 'stable';
    let changePercent = 0;

    if (points.length >= 2) {
      const first = points[0].score;
      const last = points[points.length - 1].score;
      changePercent = ((last - first) / (first || 1)) * 100;
      trend = changePercent > 5 ? 'improving' : changePercent < -5 ? 'degrading' : 'stable';
    }

    return {
      domain: query.domain,
      dataPoints: points,
      trend,
      changePercent: Math.round(changePercent * 10) / 10,
      firstScan: points[0]?.timestamp || '',
      lastScan: points[points.length - 1]?.timestamp || '',
      totalScans: points.length,
    };
  }

  // ─── Compare ─────────────────────────────────────────────
  async compareAnalyses(ids: string[]) {
    const analyses = await Promise.all(ids.map((id) => this.getAnalysisById(id)));

    const sites = analyses.map((a) => ({
      url: a.url,
      score: a.score,
      grade: a.score.grade,
      analysisId: a.id,
    }));

    const winner = sites.sort((a, b) => b.score.overall - a.score.overall)[0]?.url;

    const categoryWinners: Record<string, string> = {};
    for (const cat of ['headers', 'tls', 'csp', 'cookies', 'dns', 'reputation'] as const) {
      const best = sites.reduce((prev, curr) =>
        (curr.score.categories[cat]?.score ?? 0) > (prev.score.categories[cat]?.score ?? 0)
          ? curr
          : prev,
      );
      categoryWinners[cat] = best.url;
    }

    return { sites, winner, categoryWinners };
  }

  // ─── Top domains ─────────────────────────────────────────
  async getTopDomains(limit: number) {
    const domains = await this.prisma.domainCache.findMany({
      orderBy: { bestScore: 'desc' },
      take: Math.min(limit, 100),
      select: {
        domain: true,
        bestScore: true,
        bestGrade: true,
        scanCount: true,
        trending: true,
        lastAnalyzed: true,
      },
    });

    return { domains, total: domains.length };
  }

  // ─── Global stats ────────────────────────────────────────
  async getGlobalStats() {
    const cacheKey = 'stats:global';
    const cached = await this.redis.get(cacheKey, 'cache');
    if (cached) return cached;

    const stats = await this.prisma.getAnalysisStats();

    const result = {
      totalScans: stats.total,
      last24h: stats.last24h,
      gradeDistribution: stats.byGrade.reduce(
        (acc: Record<string, number>, g: any) => {
          acc[g.grade || 'unknown'] = g._count.grade;
          return acc;
        },
        {},
      ),
      averageScore: Math.round((stats.avgScore._avg.overallScore || 0) * 10) / 10,
      minScore: stats.avgScore._min.overallScore || 0,
      maxScore: stats.avgScore._max.overallScore || 0,
      generatedAt: new Date().toISOString(),
    };

    await this.redis.set(cacheKey, result, 60, 'cache');
    return result;
  }

  // ─── Job status ──────────────────────────────────────────
  async getJobStatus(jobId: string) {
    const queueMetrics = await this.orchestrator.getQueueMetrics();
    const meta = await this.redis.get(`job:meta:${jobId}`);

    return {
      jobId,
      meta,
      queueMetrics,
    };
  }

  // ─── Cancel job ──────────────────────────────────────────
  async cancelJob(jobId: string) {
    const cancelled = await this.orchestrator.cancelJob(jobId);
    return { success: cancelled, jobId };
  }

  // ─── Export ──────────────────────────────────────────────
  async exportAnalysis(id: string, format: 'json' | 'csv'): Promise<string> {
    const analysis = await this.getAnalysisById(id);

    if (format === 'json') {
      return JSON.stringify(analysis, null, 2);
    }

    // CSV export
    const rows: string[] = [
      'Category,Header,Status,Score,MaxScore,Severity,Recommendation',
      ...analysis.headers.map((h) =>
        [
          'header',
          h.name,
          h.status,
          h.score,
          h.maxScore,
          h.severity,
          `"${h.recommendation.replace(/"/g, '""')}"`,
        ].join(','),
      ),
    ];

    return rows.join('\n');
  }

  // ─── Sanitize: strip null bytes (Postgres rejects \u0000 in text/json) ──
  private sanitizeDeep<T>(value: T): T {
    if (typeof value === 'string') {
      return value.replace(/\u0000/g, '') as unknown as T;
    }
    if (Array.isArray(value)) {
      return value.map((v) => this.sanitizeDeep(v)) as unknown as T;
    }
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        out[k] = this.sanitizeDeep(v);
      }
      return out as T;
    }
    return value;
  }
// ─── Persist analysis result ─────────────────────────────
  async persistResult(data: {
    correlationId: string;
    url: string;
    domain: string;
    httpInfo: any;
    headers: any[];
    csp: any;
    tls: any;
    cookies: any[];
    dns: any;
    virusTotal: any;
    rdap: any;
    score: any;
    jobMeta: any;
    duration: number;
  }) {
    data = this.sanitizeDeep(data);

    const {
      correlationId, url, domain, httpInfo, headers,
      csp, tls, cookies, dns, virusTotal, rdap, score, jobMeta, duration,
    } = data;

    // Upsert analysis
    const analysis = await this.prisma.analysis.upsert({
      where: { correlationId },
      create: {
        correlationId,
        url,
        domain,
        finalUrl: httpInfo?.finalUrl,
        statusCode: httpInfo?.statusCode,
        duration,
        overallScore: score?.overall,
        grade: score?.grade,
        headersScore: score?.categories?.headers?.score,
        tlsScore: score?.categories?.tls?.score,
        cspScore: score?.categories?.csp?.score,
        cookiesScore: score?.categories?.cookies?.score,
        dnsScore: score?.categories?.dns?.score,
        reputationScore: score?.categories?.reputation?.score,
        xssRisk: score?.riskProfile?.xssRisk,
        clickjackingRisk: score?.riskProfile?.clickjackingRisk,
        mitmRisk: score?.riskProfile?.mitmRisk,
        http2Enabled: httpInfo?.http2,
        http3Enabled: httpInfo?.http3,
        cdn: httpInfo?.cdn,
        waf: httpInfo?.waf,
        serverTech: httpInfo?.serverTechnology || [],
        ttfb: httpInfo?.timing?.ttfb,
        tlsGrade: tls?.grade,
        certExpiry: tls?.certExpiry ? new Date(tls.certExpiry) : undefined,
        certIssuer: tls?.certIssuer,
        hstsEnabled: tls?.hsts,
        hstsMaxAge: tls?.hstsMaxAge,
        heartbleed: tls?.heartbleed,
        poodle: tls?.poodle,
        vtMalicious: virusTotal?.malicious,
        vtReputation: virusTotal?.reputation,
        vtThreatNames: virusTotal?.threatNames || [],
        jobId: jobMeta?.jobId,
        rawResult: data as any,
      },
      update: {
        overallScore: score?.overall,
        grade: score?.grade,
        duration,
        rawResult: data as any,
      },
    });

    // Create header results
    if (headers?.length) {
      await this.prisma.headerResult.deleteMany({ where: { analysisId: analysis.id } });
      await this.prisma.headerResult.createMany({
        data: headers.map((h: any) => ({
          analysisId: analysis.id,
          name: h.name,
          value: h.value,
          status: h.status,
          severity: h.severity,
          score: h.score,
          maxScore: h.maxScore,
          recommendation: h.recommendation,
          details: h.details,
          cweIds: h.cweIds || [],
          owaspCategory: h.owaspCategory,
        })),
      });
    }

    // Upsert domain cache
    await this.prisma.domainCache.upsert({
      where: { domain },
      create: {
        domain,
        lastAnalyzed: new Date(),
        scanCount: 1,
        bestScore: score?.overall,
        bestGrade: score?.grade,
        worstScore: score?.overall,
        avgScore: score?.overall,
      },
      update: {
        lastAnalyzed: new Date(),
        scanCount: { increment: 1 },
        bestScore: { set: Math.max(score?.overall || 0, 0) },
        bestGrade: score?.grade,
      },
    });

    this.logger.log(`✅ Persisted analysis ${analysis.id} for ${domain} (score: ${score?.overall})`);
    return analysis;
  }

  // ─── Map DB model to AnalysisResult ──────────────────────
  private mapAnalysisToResult(analysis: any): AnalysisResult {
    return {
      id: analysis.id,
      url: analysis.url,
      domain: analysis.domain,
      analyzedAt: analysis.analyzedAt.toISOString(),
      duration: analysis.duration || 0,
      http: analysis.rawResult?.httpInfo || {
        url: analysis.url,
        finalUrl: analysis.finalUrl || analysis.url,
        statusCode: analysis.statusCode || 200,
        statusText: 'OK',
        redirectChain: [],
        timing: { dns: 0, connect: 0, tls: 0, ttfb: analysis.ttfb || 0, transfer: 0, total: 0 },
        serverTechnology: analysis.serverTech || [],
        cdn: analysis.cdn,
        waf: analysis.waf,
        compression: null,
        http2: analysis.http2Enabled || false,
        http3: analysis.http3Enabled || false,
        rawHeaders: {},
        securityHeaders: {},
        responseSize: 0,
        transferSize: 0,
      },
      headers: analysis.headers?.map((h: any) => ({
        name: h.name,
        value: h.value,
        status: h.status,
        severity: h.severity,
        score: h.score,
        maxScore: h.maxScore,
        recommendation: h.recommendation || '',
        details: h.details || '',
        references: [],
        cweIds: h.cweIds || [],
        owaspCategory: h.owaspCategory,
      })) || [],
      csp: analysis.rawResult?.csp || { raw: null, parsed: {}, grade: 'N/A', score: 0, unsafeDirectives: [], missingDirectives: [], wildcardSources: [], nonces: [], hashes: [], violations: [], bypassRisks: [], reportingEnabled: false, strictMode: false },
      tls: analysis.rawResult?.tls || null,
      cookies: analysis.cookies?.map((c: any) => ({
        name: c.name,
        value: '',
        httpOnly: c.httpOnly,
        secure: c.secure,
        sameSite: c.sameSite,
        issues: c.issues || [],
        risk: c.risk,
        score: c.score,
      })) || [],
      dns: analysis.dnsScan || analysis.rawResult?.dns || { ipv4: [], ipv6: [], mx: [], txt: [], cname: null, ns: [], dmarc: null, spf: null, dkim: null, caa: [], dnssec: false, rdns: {}, asn: [], geolocation: [] },
      virusTotal: analysis.rawResult?.virusTotal || null,
      rdap: analysis.rawResult?.rdap || null,
      score: {
        overall: analysis.overallScore || 0,
        grade: (analysis.grade || 'F') as any,
        categories: {
          headers: { score: analysis.headersScore || 0, maxScore: 100, weight: 0.25, grade: 'F' as any, label: 'Headers', color: '#ef4444' },
          tls: { score: analysis.tlsScore || 0, maxScore: 100, weight: 0.25, grade: 'F' as any, label: 'TLS', color: '#ef4444' },
          csp: { score: analysis.cspScore || 0, maxScore: 100, weight: 0.20, grade: 'F' as any, label: 'CSP', color: '#ef4444' },
          cookies: { score: analysis.cookiesScore || 0, maxScore: 100, weight: 0.10, grade: 'F' as any, label: 'Cookies', color: '#ef4444' },
          dns: { score: analysis.dnsScore || 0, maxScore: 100, weight: 0.10, grade: 'F' as any, label: 'DNS', color: '#ef4444' },
          reputation: { score: analysis.reputationScore || 0, maxScore: 100, weight: 0.10, grade: 'F' as any, label: 'Reputation', color: '#ef4444' },
        },
        breakdown: analysis.rawResult?.score?.breakdown || [],
        improvements: analysis.improvements?.map((i: any) => ({
          priority: i.priority,
          category: i.category,
          header: i.header,
          action: i.action,
          impact: i.impact,
          effort: i.effort,
          scoreGain: i.scoreGain,
          references: i.references || [],
        })) || [],
        riskProfile: analysis.rawResult?.score?.riskProfile || { xssRisk: 'critical', clickjackingRisk: 'high', mitmRisk: 'critical', dataLeakageRisk: 'medium', codeInjectionRisk: 'medium', cryptoRisk: 'medium', overallRisk: 'critical' },
        complianceStatus: analysis.rawResult?.score?.complianceStatus || {},
      },
      jobMeta: {
        jobId: analysis.jobLog?.jobId || '',
        correlationId: analysis.correlationId,
        submittedAt: analysis.analyzedAt.toISOString(),
        completedAt: analysis.jobLog?.completedAt?.toISOString(),
        attempts: analysis.jobLog?.attempts || 1,
        maxAttempts: 3,
        workerType: analysis.jobLog?.workerType as any || 'io',
        status: 'completed',
        progress: 100,
        stage: 'COMPLETE',
      },
    };
  }
}
