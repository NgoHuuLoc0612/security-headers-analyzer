// apps/api/src/modules/workers/io.worker.ts
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  Client,
  Dispatcher,
  request as undiciRequest,
  Pool,
} from 'undici';
import * as dns from 'dns/promises';
import { QUEUE_NAMES, JOB_NAMES, WORKER_CONCURRENCY } from '../queue/queue.constants';
import { JobOrchestratorService, AnalysisJobData } from '../queue/job-orchestrator.service';
import { RedisService } from '../../database/redis.service';
import type { HTTPInfo, DNSInfo, RedirectHop, RequestTiming } from '@sha/types';

@Processor(QUEUE_NAMES.IO_WORKER, {
  concurrency: WORKER_CONCURRENCY.io,
  stalledInterval: 30000,
  maxStalledCount: 2,
})
export class IoWorker extends WorkerHost {
  private readonly logger = new Logger(`IoWorker[PID:${process.pid}]`);
  private readonly connectionPools = new Map<string, Pool>();

  constructor(
    private readonly orchestrator: JobOrchestratorService,
    private readonly redis: RedisService,
    private readonly events: EventEmitter2,
  ) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    const { name, data } = job;
    const jobData = data as AnalysisJobData & { stage: string };

    this.logger.debug(`Processing IO job: ${name} | ${jobData.correlationId}`);

    try {
      switch (name) {
        case JOB_NAMES.FETCH_HTTP:
          return await this.processHttpFetch(job, jobData);
        case JOB_NAMES.RESOLVE_DNS:
          return await this.processDnsResolution(job, jobData);
        case JOB_NAMES.CHECK_REDIRECT_CHAIN:
          return await this.processRedirectChain(job, jobData);
        default:
          throw new Error(`Unknown IO job: ${name}`);
      }
    } catch (error) {
      await this.orchestrator.updateProgress(
        jobData.correlationId,
        'FAILED',
        0,
        { error: (error as Error).message, stage: name },
      );
      throw error;
    }
  }

  // ─── HTTP Fetch via Undici ───────────────────────────────
  private async processHttpFetch(
    job: Job,
    jobData: AnalysisJobData,
  ): Promise<HTTPInfo> {
    const { url, options, correlationId } = jobData;

    await this.orchestrator.updateProgress(correlationId, 'HTTP_FETCH', 10);
    await job.updateProgress(10);

    const startTime = Date.now();
    const timings: Partial<RequestTiming> = {};
    const redirectChain: RedirectHop[] = [];

    let currentUrl = url;
    let finalUrl = url;
    let statusCode = 0;
    let statusText = '';
    let rawHeaders: Record<string, string> = {};
    let responseBody = '';
    let redirectCount = 0;
    const maxRedirects = options?.maxRedirects ?? 10;

    while (redirectCount <= maxRedirects) {
      const urlObj = new URL(currentUrl);
      const pool = this.getOrCreatePool(urlObj.origin);

      const dnsStart = Date.now();
      try {
        // DNS timing via lookup before actual request
        await dns.lookup(urlObj.hostname);
        timings.dns = Date.now() - dnsStart;
      } catch {
        timings.dns = Date.now() - dnsStart;
      }

      const connectStart = Date.now();
      let response: Dispatcher.ResponseData;

      try {
        response = await pool.request({
          path: urlObj.pathname + urlObj.search || '/',
          method: 'GET',
          headers: {
            'User-Agent': 'SecurityHeadersAnalyzer/1.0 (+https://sha.dev)',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate, br',
            'Cache-Control': 'no-cache',
            Pragma: 'no-cache',
          },
          maxRedirections: 0, // Manual redirect following
          headersTimeout: options?.timeoutMs ?? 30000,
          bodyTimeout: options?.timeoutMs ?? 30000,
        });
      } catch (err: unknown) {
        // Try HTTP if HTTPS fails
        if (currentUrl.startsWith('https://') && (err as NodeJS.ErrnoException).code === 'ECONNREFUSED') {
          currentUrl = currentUrl.replace('https://', 'http://');
          continue;
        }
        throw err;
      }

      timings.connect = Date.now() - connectStart;

      const hop: RedirectHop = {
        url: currentUrl,
        statusCode: response.statusCode,
        isHttpToHttps: currentUrl.startsWith('http://') && finalUrl.startsWith('https://'),
        hasSTS: !!response.headers['strict-transport-security'],
      };

      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        const location = response.headers['location'] as string;
        if (!location) break;

        hop.location = location;
        redirectChain.push(hop);
        currentUrl = location.startsWith('http') ? location : new URL(location, currentUrl).href;
        redirectCount++;

        // Drain body to free connection
        await response.body.dump();
        continue;
      }

      // Final response
      finalUrl = currentUrl;
      statusCode = response.statusCode;
      statusText = String(response.statusCode);

      // Extract headers
      for (const [key, val] of Object.entries(response.headers)) {
        rawHeaders[key.toLowerCase()] = Array.isArray(val) ? val.join(', ') : String(val || '');
      }

      timings.ttfb = Date.now() - connectStart;

      // Body (limit to 100KB for subresource analysis)
      const bodyBytes = await response.body.arrayBuffer();
      responseBody = new TextDecoder().decode(bodyBytes.slice(0, 102400)).replace(/\u0000/g, '');

      timings.transfer = Date.now() - connectStart - timings.ttfb;
      break;
    }

    timings.total = Date.now() - startTime;

    const securityHeaders = this.extractSecurityHeaders(rawHeaders);
    const serverTech = this.detectServerTech(rawHeaders);

    await this.orchestrator.updateProgress(correlationId, 'HTTP_FETCH', 40);
    await job.updateProgress(40);

    const result: HTTPInfo = {
      url,
      finalUrl,
      statusCode,
      statusText,
      redirectChain,
      timing: {
        dns: timings.dns || 0,
        connect: timings.connect || 0,
        tls: timings.tls || 0,
        ttfb: timings.ttfb || 0,
        transfer: timings.transfer || 0,
        total: timings.total || 0,
      },
      serverTechnology: serverTech,
      cdn: this.detectCDN(rawHeaders),
      waf: this.detectWAF(rawHeaders),
      compression: rawHeaders['content-encoding'] || null,
      http2: !!rawHeaders[':status'], // HTTP/2 headers use `:status`
      http3: rawHeaders['alt-svc']?.includes('h3') || false,
      rawHeaders,
      securityHeaders,
      responseSize: Buffer.byteLength(responseBody),
      transferSize: Buffer.byteLength(responseBody),
    };

    // Cache full HTTP info for the Result Aggregator (statusCode, timing, etc),
    // plus the header-focused subset CPU workers (rule engine) need.
    await this.redis.set(
      `fetch:${correlationId}`,
      {
        ...result,
        responseBody: responseBody.substring(0, 10000),
      },
      3600,
    );

    return result;
  }

  // ─── DNS Resolution ──────────────────────────────────────
  private async processDnsResolution(
    job: Job,
    jobData: AnalysisJobData,
  ): Promise<DNSInfo> {
    const { url, correlationId } = jobData;
    const domain = new URL(url.startsWith('http') ? url : `https://${url}`).hostname;

    await this.orchestrator.updateProgress(correlationId, 'DNS_RESOLUTION', 5);

    const [
      ipv4Result,
      ipv6Result,
      mxResult,
      txtResult,
      nsResult,
      cnameResult,
    ] = await Promise.allSettled([
      dns.resolve4(domain),
      dns.resolve6(domain),
      dns.resolveMx(domain),
      dns.resolveTxt(domain),
      dns.resolveNs(domain),
      dns.resolveCname(domain),
    ]);

    const ipv4 = ipv4Result.status === 'fulfilled' ? ipv4Result.value : [];
    const ipv6 = ipv6Result.status === 'fulfilled' ? ipv6Result.value : [];
    const mx = mxResult.status === 'fulfilled' ? mxResult.value : [];
    const txtRaw = txtResult.status === 'fulfilled' ? txtResult.value.flat() : [];
    const ns = nsResult.status === 'fulfilled' ? nsResult.value : [];
    const cname = cnameResult.status === 'fulfilled' && cnameResult.value.length > 0
      ? cnameResult.value[0]
      : null;

    // DMARC, SPF, DKIM from TXT records
    const dmarc = txtRaw.find((t) => t.startsWith('v=DMARC1')) || null;
    const spf = txtRaw.find((t) => t.startsWith('v=spf1')) || null;
    const dkim = txtRaw.find((t) => t.startsWith('v=DKIM1')) || null;

    // CAA records
    let caa: string[] = [];
    try {
      const caaResult = await dns.resolveCaa(domain);
      caa = caaResult.map((r: any) => `${r.critical} ${r.tag} "${r.value}"`);
    } catch {}

    // DNSSEC check via SOA
    let dnssec = false;
    try {
      const soa = await (dns as any).resolve(domain, 'DNSKEY');
      dnssec = soa && soa.length > 0;
    } catch {}

    // Reverse DNS for IPs
    const rdns: Record<string, string> = {};
    await Promise.allSettled(
      ipv4.slice(0, 3).map(async (ip) => {
        try {
          const hostnames = await dns.reverse(ip);
          rdns[ip] = hostnames[0] || '';
        } catch {}
      }),
    );

    await job.updateProgress(100);
    await this.orchestrator.updateProgress(correlationId, 'DNS_RESOLUTION', 100);

    return {
      ipv4,
      ipv6,
      mx: mx.map((r) => ({ priority: r.priority, exchange: r.exchange })),
      txt: txtRaw,
      cname,
      ns,
      dmarc,
      spf,
      dkim,
      caa,
      dnssec,
      rdns,
      asn: [],          // Filled by enrichment layer
      geolocation: [],  // Filled by enrichment layer
    };
  }

  // ─── Redirect chain analysis ──────────────────────────────
  private async processRedirectChain(
    job: Job,
    jobData: AnalysisJobData,
  ): Promise<RedirectHop[]> {
    // Delegate to HTTP fetch with redirect tracking
    const httpResult = await this.processHttpFetch(job, jobData);
    return httpResult.redirectChain;
  }

  // ─── Helpers ─────────────────────────────────────────────
  private getOrCreatePool(origin: string): Pool {
    if (!this.connectionPools.has(origin)) {
      const pool = new Pool(origin, {
        connections: 10,
        pipelining: 3,
        keepAliveTimeout: 10000,
        keepAliveMaxTimeout: 30000,
        headersTimeout: 30000,
        bodyTimeout: 30000,
        connect: {
          rejectUnauthorized: false, // Allow self-signed for analysis
          timeout: 10000,
        },
      });
      this.connectionPools.set(origin, pool);
    }
    return this.connectionPools.get(origin)!;
  }

  private extractSecurityHeaders(headers: Record<string, string>): Record<string, string> {
    const securityHeaderNames = [
      'content-security-policy',
      'content-security-policy-report-only',
      'strict-transport-security',
      'x-frame-options',
      'x-content-type-options',
      'referrer-policy',
      'permissions-policy',
      'feature-policy',
      'x-xss-protection',
      'cross-origin-opener-policy',
      'cross-origin-embedder-policy',
      'cross-origin-resource-policy',
      'access-control-allow-origin',
      'access-control-allow-credentials',
      'cache-control',
      'pragma',
      'expect-ct',
      'public-key-pins',
      'public-key-pins-report-only',
      'x-permitted-cross-domain-policies',
      'clear-site-data',
      'timing-allow-origin',
    ];

    const result: Record<string, string> = {};
    for (const name of securityHeaderNames) {
      if (headers[name]) result[name] = headers[name];
    }
    return result;
  }

  private detectServerTech(headers: Record<string, string>): string[] {
    const tech: string[] = [];
    const server = headers['server'] || '';
    const powered = headers['x-powered-by'] || '';
    const via = headers['via'] || '';

    if (server) tech.push(server);
    if (powered) tech.push(powered);
    if (via) tech.push(`via:${via}`);

    return [...new Set(tech.filter(Boolean))];
  }

  private detectCDN(headers: Record<string, string>): string | undefined {
    if (headers['cf-ray']) return 'Cloudflare';
    if (headers['x-served-by']?.includes('cache')) return 'Fastly';
    if (headers['x-cache']?.includes('CloudFront')) return 'CloudFront';
    if (headers['via']?.includes('akamai')) return 'Akamai';
    if (headers['x-azure-ref']) return 'Azure CDN';
    if (headers['x-goog-served-by']) return 'Google Cloud CDN';
    if (headers['server']?.includes('nginx')) return undefined;
    return undefined;
  }

  private detectWAF(headers: Record<string, string>): string | undefined {
    if (headers['x-sucuri-id']) return 'Sucuri';
    if (headers['x-waf-event-info']) return 'Imperva';
    if (headers['x-barracuda-attack-id']) return 'Barracuda';
    if (headers['server']?.includes('cloudflare')) return 'Cloudflare WAF';
    return undefined;
  }

  async onApplicationShutdown() {
    await Promise.allSettled(
      Array.from(this.connectionPools.values()).map((p) => p.close()),
    );
  }
}
