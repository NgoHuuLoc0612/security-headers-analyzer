// apps/api/src/modules/workers/result-aggregator.worker.ts
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
import { AnalysisService } from '../analysis/analysis.service';

@Processor(QUEUE_NAMES.RESULT_AGGREGATOR, {
  concurrency: 5,
  stalledInterval: 60000,
})
export class ResultAggregatorWorker extends WorkerHost {
  private readonly logger = new Logger(`ResultAggregator[PID:${process.pid}]`);

  constructor(
    private readonly orchestrator: JobOrchestratorService,
    private readonly redis: RedisService,
    private readonly ruleEngine: RuleEngineService,
    private readonly scoring: ScoringService,
    private readonly cspAnalyzer: CSPAnalyzerService,
    private readonly cookieAnalyzer: CookieAnalyzerService,
    private readonly analysisService: AnalysisService,
    private readonly events: EventEmitter2,
  ) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    const jobData = job.data as AnalysisJobData;
    const { correlationId, url, domain } = jobData;
    const startTime = Date.now();

    this.logger.log(`Aggregating results for ${correlationId} (${url})`);
    await this.orchestrator.updateProgress(correlationId, 'PERSISTING', 85);

    // Fan-in: collect all sub-results from Redis
    const [fetchData, dnsData, sslData, vtData, rdapData] = await Promise.all([
      this.redis.get<any>(`fetch:${correlationId}`),
      this.redis.get<any>(`dns:${correlationId}`),
      this.redis.get<any>(`ssl:${correlationId}`),
      this.redis.get<any>(`vt:${correlationId}`),
      this.redis.get<any>(`rdap:${correlationId}`),
    ]);

    if (!fetchData) {
      throw new Error(`No fetch data found for ${correlationId} — sub-jobs may not have completed`);
    }

    await job.updateProgress(20);

    // Run all CPU-side analysis synchronously in aggregator
    const [headers, csp, cookies] = await Promise.all([
      this.ruleEngine.analyzeSecurityHeaders(fetchData.securityHeaders || {}),
      this.cspAnalyzer.analyze(fetchData.rawHeaders?.['content-security-policy'] || null),
      this.cookieAnalyzer.analyze(fetchData.rawHeaders?.['set-cookie'] || ''),
    ]);

    await job.updateProgress(50);

    // Calculate composite score
    const score = this.scoring.calculate({
      headers,
      csp,
      cookies,
      tls: sslData,
      reputation: vtData,
      dns: dnsData,
    });

    await job.updateProgress(70);

    const duration = Date.now() - startTime;

    // Persist everything to PostgreSQL
    const persisted = await this.analysisService.persistResult({
      correlationId,
      url,
      domain,
      httpInfo: fetchData,
      headers,
      csp,
      tls: sslData,
      cookies,
      dns: dnsData,
      virusTotal: vtData,
      rdap: rdapData,
      score,
      jobMeta: {
        jobId: job.id,
        correlationId,
        stage: 'COMPLETE',
        progress: 100,
        attempts: job.attemptsMade + 1,
      },
      duration,
    });

    await job.updateProgress(90);

    // Cache full result
    const fullResult = {
      id: persisted.id,
      correlationId,
      url,
      domain,
      score,
      headers,
      csp,
      cookies,
      tls: sslData,
      dns: dnsData,
      virusTotal: vtData,
      rdap: rdapData,
      http: fetchData,
      analyzedAt: new Date().toISOString(),
      duration,
    };

    await this.redis.set(`result:${persisted.id}`, fullResult, 300, 'cache');
    await this.redis.set(`result:corr:${correlationId}`, fullResult, 300, 'cache');

    // Clean up working keys
    await Promise.allSettled([
      this.redis.del(`fetch:${correlationId}`),
      this.redis.del(`dns:${correlationId}`),
      this.redis.del(`ssl:${correlationId}`),
      this.redis.del(`vt:${correlationId}`),
      this.redis.del(`rdap:${correlationId}`),
    ]);

    await job.updateProgress(100);
    await this.orchestrator.updateProgress(correlationId, 'COMPLETE', 100, {
      resultId: persisted.id,
      grade: score.grade,
      overallScore: score.overall,
    });

    // Fan-out completion event to all listeners (SSE, websockets)
    this.events.emit('job:completed', {
      correlationId,
      resultId: persisted.id,
      url,
      domain,
      grade: score.grade,
      score: score.overall,
      duration,
    });

    this.logger.log(
      `✅ Analysis complete: ${correlationId} | Grade: ${score.grade} | Score: ${score.overall} | ${duration}ms`,
    );

    return { resultId: persisted.id, grade: score.grade, score: score.overall };
  }
}
