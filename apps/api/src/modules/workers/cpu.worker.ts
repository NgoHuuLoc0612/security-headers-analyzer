// apps/api/src/modules/workers/cpu.worker.ts
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { QUEUE_NAMES, JOB_NAMES, WORKER_CONCURRENCY } from '../queue/queue.constants';
import { JobOrchestratorService, AnalysisJobData } from '../queue/job-orchestrator.service';
import { RedisService } from '../../database/redis.service';
import { RuleEngineService } from './services/rule-engine.service';
import { ScoringService } from './services/scoring.service';
import { CSPAnalyzerService } from './services/csp-analyzer.service';
import { CookieAnalyzerService } from './services/cookie-analyzer.service';
import type { HeaderAnalysis, CSPAnalysis, CookieAnalysis, SecurityScore } from '@sha/types';

@Processor(QUEUE_NAMES.CPU_WORKER, {
  concurrency: WORKER_CONCURRENCY.cpu,
  stalledInterval: 60000,
  maxStalledCount: 1,
})
export class CpuWorker extends WorkerHost {
  private readonly logger = new Logger(`CpuWorker[PID:${process.pid}]`);

  constructor(
    private readonly orchestrator: JobOrchestratorService,
    private readonly redis: RedisService,
    private readonly ruleEngine: RuleEngineService,
    private readonly scoring: ScoringService,
    private readonly cspAnalyzer: CSPAnalyzerService,
    private readonly cookieAnalyzer: CookieAnalyzerService,
    private readonly events: EventEmitter2,
  ) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    const { name, data } = job;
    const jobData = data as AnalysisJobData & { stage: string };

    try {
      switch (name) {
        case JOB_NAMES.ANALYZE_HEADERS:
          return await this.processHeaderAnalysis(job, jobData);
        case JOB_NAMES.ANALYZE_CSP:
          return await this.processCSPAnalysis(job, jobData);
        case JOB_NAMES.ANALYZE_COOKIES:
          return await this.processCookieAnalysis(job, jobData);
        case JOB_NAMES.RUN_RULE_ENGINE:
          return await this.processRuleEngine(job, jobData);
        case JOB_NAMES.CALCULATE_SCORE:
          return await this.processScoring(job, jobData);
        default:
          throw new Error(`Unknown CPU job: ${name}`);
      }
    } catch (error) {
      this.logger.error(`CPU job ${name} failed: ${(error as Error).message}`);
      throw error;
    }
  }

  private async processHeaderAnalysis(
    job: Job,
    jobData: AnalysisJobData,
  ): Promise<HeaderAnalysis[]> {
    const { correlationId } = jobData;
    await this.orchestrator.updateProgress(correlationId, 'RULE_ENGINE', 50);

    const fetchData = await this.redis.get<{
      rawHeaders: Record<string, string>;
      securityHeaders: Record<string, string>;
    }>(`fetch:${correlationId}`);

    if (!fetchData) throw new Error('No fetch data found for analysis');

    const headers = await this.ruleEngine.analyzeSecurityHeaders(
      fetchData.securityHeaders,
    );

    await job.updateProgress(100);
    return headers;
  }

  private async processCSPAnalysis(
    job: Job,
    jobData: AnalysisJobData,
  ): Promise<CSPAnalysis> {
    const { correlationId } = jobData;
    const fetchData = await this.redis.get<{
      rawHeaders: Record<string, string>;
    }>(`fetch:${correlationId}`);

    const cspHeader = fetchData?.rawHeaders['content-security-policy'] || null;
    const result = await this.cspAnalyzer.analyze(cspHeader);

    await job.updateProgress(100);
    return result;
  }

  private async processCookieAnalysis(
    job: Job,
    jobData: AnalysisJobData,
  ): Promise<CookieAnalysis[]> {
    const { correlationId } = jobData;
    const fetchData = await this.redis.get<{
      rawHeaders: Record<string, string>;
    }>(`fetch:${correlationId}`);

    const setCookieHeader = fetchData?.rawHeaders['set-cookie'] || '';
    const result = await this.cookieAnalyzer.analyze(setCookieHeader);

    await job.updateProgress(100);
    return result;
  }

  private async processRuleEngine(
    job: Job,
    jobData: AnalysisJobData,
  ): Promise<Record<string, unknown>> {
    const { correlationId } = jobData;
    await this.orchestrator.updateProgress(correlationId, 'RULE_ENGINE', 60);

    // Gather all sub-results from Redis
    const [fetchData, sslData, vtData, rdapData] = await Promise.all([
      this.redis.get<Record<string, unknown>>(`fetch:${correlationId}`),
      this.redis.get<Record<string, unknown>>(`ssl:${correlationId}`),
      this.redis.get<Record<string, unknown>>(`vt:${correlationId}`),
      this.redis.get<Record<string, unknown>>(`rdap:${correlationId}`),
    ]);

    const ruleResults = await this.ruleEngine.runAllRules({
      headers: fetchData?.securityHeaders as Record<string, string> || {},
      tls: sslData,
      reputation: vtData,
      registration: rdapData,
    });

    await job.updateProgress(100);
    return ruleResults;
  }

  private async processScoring(
    job: Job,
    jobData: AnalysisJobData,
  ): Promise<SecurityScore> {
    const { correlationId } = jobData;
    await this.orchestrator.updateProgress(correlationId, 'SCORING', 80);

    // Gather everything
    const [headerResults, cspData, cookieResults, sslData, vtData, rdapData, dnsData] =
      await Promise.all([
        this.redis.get<HeaderAnalysis[]>(`headers:${correlationId}`),
        this.redis.get<CSPAnalysis>(`csp:${correlationId}`),
        this.redis.get<CookieAnalysis[]>(`cookies:${correlationId}`),
        this.redis.get<Record<string, unknown>>(`ssl:${correlationId}`),
        this.redis.get<Record<string, unknown>>(`vt:${correlationId}`),
        this.redis.get<Record<string, unknown>>(`rdap:${correlationId}`),
        this.redis.get<Record<string, unknown>>(`dns:${correlationId}`),
      ]);

    const score = this.scoring.calculate({
      headers: headerResults || [],
      csp: cspData,
      cookies: cookieResults || [],
      tls: sslData,
      reputation: vtData,
      dns: dnsData,
    });

    await job.updateProgress(100);
    await this.orchestrator.updateProgress(correlationId, 'SCORING', 100);

    return score;
  }
}
