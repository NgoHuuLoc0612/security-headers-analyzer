// apps/api/src/modules/workers/api.worker.ts
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { request as undiciRequest } from 'undici';
import { QUEUE_NAMES, JOB_NAMES, WORKER_CONCURRENCY } from '../queue/queue.constants';
import { JobOrchestratorService, AnalysisJobData } from '../queue/job-orchestrator.service';
import { RedisService } from '../../database/redis.service';
import type { TLSInfo, VirusTotalResult, RDAPResult } from '@sha/types';

@Processor(QUEUE_NAMES.API_WORKER, {
  concurrency: WORKER_CONCURRENCY.api,
  stalledInterval: 120000,
  maxStalledCount: 2,
  limiter: {
    max: 10,
    duration: 1000, // Max 10 API calls/sec per worker
  },
})
export class ApiWorker extends WorkerHost {
  private readonly logger = new Logger(`ApiWorker[PID:${process.pid}]`);

  constructor(
    private readonly orchestrator: JobOrchestratorService,
    private readonly redis: RedisService,
    private readonly events: EventEmitter2,
    private readonly config: ConfigService,
  ) {
    super();
  }

  // Fires for EVERY failed attempt, not just the final one. We only move
  // to DLQ once BullMQ has exhausted all configured retries — checking
  // attemptsMade against the job's own configured `attempts` option
  // (RETRY_CONFIG.api.attempts = 4) avoids prematurely DLQ'ing a job
  // that's still going to be retried.
  @OnWorkerEvent('failed')
  async onFailed(job: Job, error: Error) {
    const maxAttempts = job.opts?.attempts ?? 1;
    if (job.attemptsMade >= maxAttempts) {
      this.logger.warn(
        `Job ${job.id} (${job.name}) exhausted ${maxAttempts} attempts — moving to DLQ`,
      );
      await this.orchestrator.moveToDLQ(job, 'api', error);
    } else {
      this.logger.debug(
        `Job ${job.id} (${job.name}) failed attempt ${job.attemptsMade}/${maxAttempts}, will retry`,
      );
    }
  }

  async process(job: Job): Promise<unknown> {
    const { name, data } = job;
    const jobData = data as AnalysisJobData & { stage: string };

    try {
      switch (name) {
        case JOB_NAMES.SSL_LABS_SCAN:
          return await this.processSSLLabs(job, jobData);
        case JOB_NAMES.VIRUS_TOTAL_SCAN:
          return await this.processVirusTotal(job, jobData);
        case JOB_NAMES.RDAP_LOOKUP:
          return await this.processRDAP(job, jobData);
        default:
          throw new Error(`Unknown API job: ${name}`);
      }
    } catch (error) {
      this.logger.error(`API job ${name} failed: ${(error as Error).message}`);
      throw error;
    }
  }

  // ─── SSL Labs API ─────────────────────────────────────────
  private async processSSLLabs(job: Job, jobData: AnalysisJobData): Promise<TLSInfo | null> {
    const { url, correlationId } = jobData;
    const domain = new URL(url.startsWith('http') ? url : `https://${url}`).hostname;

    await this.orchestrator.updateProgress(correlationId, 'SSL_LABS', 15);
    await job.updateProgress(10);

    // Cache check
    const cached = await this.redis.get<TLSInfo>(`ssl_cache:${domain}`);
    if (cached) {
      await this.redis.set(`ssl:${correlationId}`, cached, 3600);
      await job.updateProgress(100);
      return cached;
    }

    const apiKey = this.config.get('app.sslLabsEmail');
    const baseUrl = 'https://api.ssllabs.com/api/v3';

    try {
      // Initiate analysis
      const analyzeUrl = `${baseUrl}/analyze?host=${encodeURIComponent(domain)}&publish=off&all=done&ignoreMismatch=on${apiKey ? `&email=${encodeURIComponent(apiKey)}` : ''}`;

      let result: Record<string, unknown> | null = null;
      let attempts = 0;

      // Poll until done (max 3min)
      while (attempts < 36) {
        const { body, statusCode } = await undiciRequest(analyzeUrl, {
          method: 'GET',
          headers: { 'User-Agent': 'SecurityHeadersAnalyzer/1.0' },
          headersTimeout: 30000,
        });

        if (statusCode === 429) {
          await this.delay(30000); // Rate limit: wait 30s
          attempts++;
          continue;
        }

        if (statusCode !== 200) {
          throw new Error(`SSL Labs API error: ${statusCode}`);
        }

        result = await body.json() as Record<string, unknown>;
        const status = result?.status as string;

        await job.updateProgress(Math.min(20 + attempts * 2, 80));

        if (status === 'READY' || status === 'ERROR') break;
        if (status === 'IN_PROGRESS' || status === 'DNS') {
          await this.delay(5000);
          attempts++;
        } else {
          break;
        }
      }

      if (!result || result.status === 'ERROR') {
        return this.getFallbackTLSInfo(domain);
      }

      const tlsInfo = this.parseSslLabsResult(result);

      // Cache for 1h (SSL doesn't change often)
      await this.redis.set(`ssl_cache:${domain}`, tlsInfo, 3600);
      await this.redis.set(`ssl:${correlationId}`, tlsInfo, 3600);

      await job.updateProgress(100);
      return tlsInfo;
    } catch (error) {
      this.logger.warn(`SSL Labs failed for ${domain}: ${(error as Error).message}`);
      const fallback = await this.getFallbackTLSInfo(domain);
      await this.redis.set(`ssl:${correlationId}`, fallback, 3600);
      return fallback;
    }
  }

  // ─── VirusTotal API ───────────────────────────────────────
  private async processVirusTotal(
    job: Job,
    jobData: AnalysisJobData,
  ): Promise<VirusTotalResult | null> {
    const { url, correlationId } = jobData;
    const domain = new URL(url.startsWith('http') ? url : `https://${url}`).hostname;

    const apiKey = this.config.get<string>('app.virusTotalApiKey');
    if (!apiKey) {
      this.logger.warn('VirusTotal API key not configured, skipping');
      return null;
    }

    await this.orchestrator.updateProgress(correlationId, 'VIRUS_TOTAL', 20);

    // Cache check (1h)
    const cached = await this.redis.get<VirusTotalResult>(`vt_cache:${domain}`);
    if (cached) {
      await this.redis.set(`vt:${correlationId}`, cached, 3600);
      await job.updateProgress(100);
      return cached;
    }

    try {
      // URL analysis
      const urlId = Buffer.from(url).toString('base64url');
      const { body, statusCode } = await undiciRequest(
        `https://www.virustotal.com/api/v3/urls/${urlId}`,
        {
          method: 'GET',
          headers: {
            'x-apikey': apiKey,
            Accept: 'application/json',
          },
          headersTimeout: 30000,
        },
      );

      await job.updateProgress(50);

      if (statusCode === 404) {
        // Submit URL for analysis
        await this.submitURLToVirusTotal(url, apiKey);
        await this.delay(15000);
      }

      let vtData: Record<string, unknown>;
      if (statusCode === 200) {
        vtData = await body.json() as Record<string, unknown>;
      } else {
        const retryResp = await undiciRequest(
          `https://www.virustotal.com/api/v3/urls/${urlId}`,
          {
            method: 'GET',
            headers: { 'x-apikey': apiKey, Accept: 'application/json' },
          },
        );
        vtData = await retryResp.body.json() as Record<string, unknown>;
      }

      // Domain report
      const { body: domainBody, statusCode: domainStatusCode } = await undiciRequest(
        `https://www.virustotal.com/api/v3/domains/${domain}`,
        {
          method: 'GET',
          headers: { 'x-apikey': apiKey, Accept: 'application/json' },
        },
      );

      // Auth/credential failures are a real operational problem (bad key,
      // revoked key, quota exhausted) — these should retry with backoff
      // and eventually land in the DLQ for investigation, not be silently
      // swallowed like a transient network blip.
      if (domainStatusCode === 401 || domainStatusCode === 403) {
        throw new Error(`VirusTotal authentication failed (HTTP ${domainStatusCode}) — check VIRUSTOTAL_API_KEY`);
      }

      const domainData = await domainBody.json() as Record<string, unknown>;

      await job.updateProgress(90);

      const result = this.parseVirusTotalResult(vtData, domainData, url, domain);

      await this.redis.set(`vt_cache:${domain}`, result, 3600);
      await this.redis.set(`vt:${correlationId}`, result, 3600);
      await job.updateProgress(100);

      return result;
    } catch (error) {
      const message = (error as Error).message;
      const isAuthFailure = message.includes('authentication failed');

      if (isAuthFailure) {
        // Re-throw so BullMQ retries this job and, after exhausting
        // RETRY_CONFIG.api.attempts, the @OnWorkerEvent('failed') handler
        // moves it to the DLQ.
        this.logger.error(`VirusTotal auth failure for ${domain}: ${message}`);
        throw error;
      }

      // Non-auth failures (timeouts, rate limits, transient network issues)
      // degrade gracefully — the rest of the analysis pipeline still completes.
      this.logger.warn(`VirusTotal failed for ${domain}: ${message}`);
      return null;
    }
  }

  // ─── RDAP Lookup ─────────────────────────────────────────
  private async processRDAP(
    job: Job,
    jobData: AnalysisJobData,
  ): Promise<RDAPResult | null> {
    const { url, correlationId } = jobData;
    const domain = new URL(url.startsWith('http') ? url : `https://${url}`).hostname;

    await this.orchestrator.updateProgress(correlationId, 'RDAP', 25);

    // Cache check (24h — domain registration rarely changes)
    const cached = await this.redis.get<RDAPResult>(`rdap_cache:${domain}`);
    if (cached) {
      await this.redis.set(`rdap:${correlationId}`, cached, 3600);
      await job.updateProgress(100);
      return cached;
    }

    try {
      // Step 1: Bootstrap — find RDAP server for TLD
      const tld = domain.split('.').slice(-1)[0];
      const bootstrapUrl = `https://data.iana.org/rdap/dns.json`;

      let rdapServer = `https://rdap.verisign.com/com/v1/`;

      try {
        const { body: bootstrapBody } = await undiciRequest(bootstrapUrl, {
          headersTimeout: 10000,
        });
        const bootstrap = await bootstrapBody.json() as {
          services: Array<[string[], string[]]>;
        };

        for (const [tlds, urls] of bootstrap.services) {
          if (tlds.includes(tld) && urls.length > 0) {
            rdapServer = urls[0];
            break;
          }
        }
      } catch {}

      await job.updateProgress(40);

      // Step 2: Query RDAP
      const rdapUrl = `${rdapServer.replace(/\/$/, '')}/domain/${domain}`;
      const { body, statusCode } = await undiciRequest(rdapUrl, {
        method: 'GET',
        headers: {
          Accept: 'application/rdap+json, application/json',
          'User-Agent': 'SecurityHeadersAnalyzer/1.0',
        },
        headersTimeout: 20000,
      });

      if (statusCode !== 200) {
        throw new Error(`RDAP server returned ${statusCode}`);
      }

      const rdapData = await body.json() as Record<string, unknown>;
      await job.updateProgress(90);

      const result = this.parseRDAPResult(rdapData, domain);

      await this.redis.set(`rdap_cache:${domain}`, result, 86400); // 24h
      await this.redis.set(`rdap:${correlationId}`, result, 3600);
      await job.updateProgress(100);

      return result;
    } catch (error) {
      this.logger.warn(`RDAP failed for ${domain}: ${(error as Error).message}`);
      return null;
    }
  }

  // ─── Parsers ─────────────────────────────────────────────
  private parseSslLabsResult(data: Record<string, unknown>): TLSInfo {
    const endpoints = (data.endpoints as any[]) || [];
    const ep = endpoints[0] || {};
    const details = ep.details || {};

    return {
      grade: ep.grade || 'N/A',
      gradeDetails: ep.gradeTrustIgnored || '',
      hasWarnings: ep.hasWarnings || false,
      isExceptional: ep.isExceptional || false,
      protocol: details.protocols?.[0]?.name || 'Unknown',
      certValid: !ep.isRevoked,
      certExpiry: details.cert?.notAfter ? new Date(details.cert.notAfter * 1000).toISOString() : '',
      certIssuer: details.cert?.issuerSubject || '',
      certSubject: details.cert?.subject || '',
      certSAN: details.cert?.altNames || [],
      certKeyStrength: details.key?.strength || 0,
      certSignatureAlgorithm: details.cert?.sigAlg || '',
      certTransparency: details.cert?.sct || false,
      hsts: !!details.hstsPolicy?.status,
      hstsMaxAge: details.hstsPolicy?.maxAge || 0,
      hstsIncludeSubdomains: details.hstsPolicy?.includeSubDomains || false,
      hstsPreload: details.hstsPolicy?.preload || false,
      forwardSecrecy: details.forwardSecrecy > 0 ? 'strong' : 'none',
      vulnerabilities: this.extractSSLVulnerabilities(details),
      cipherSuites: this.parseCipherSuites(details.suites || []),
      protocols: this.parseProtocols(details.protocols || []),
      ocspStapling: details.ocspStapling || false,
      sessionResumption: String(details.sessionResumption || 'none'),
      compressionEnabled: details.compressionMethods > 0,
      heartbleed: details.heartbleed || false,
      poodle: details.poodle || false,
      beast: details.vulnBeast || false,
      freak: details.freak || false,
      logjam: details.logjam || false,
      drowned: details.drownVulnerable || false,
      robot: details.robotAttack > 0,
      ticketbleed: details.ticketbleed > 0,
      zombie_poodle: details.zombiePoodle > 0,
      golden_doodle: details.goldenDoodle > 0,
    };
  }

  private async getFallbackTLSInfo(domain: string): Promise<TLSInfo> {
    // Basic TLS check using undici
    try {
      const { socket } = await undiciRequest(`https://${domain}/`, {
        method: 'HEAD',
        headersTimeout: 10000,
      }) as any;

      return {
        grade: 'N/A',
        hasWarnings: false,
        isExceptional: false,
        protocol: 'TLS',
        certValid: true,
        certExpiry: '',
        certIssuer: '',
        certSubject: domain,
        certSAN: [],
        certKeyStrength: 0,
        certSignatureAlgorithm: '',
        certTransparency: false,
        hsts: false,
        hstsMaxAge: 0,
        hstsIncludeSubdomains: false,
        hstsPreload: false,
        forwardSecrecy: 'unknown',
        vulnerabilities: [],
        cipherSuites: [],
        protocols: [],
        ocspStapling: false,
        sessionResumption: 'unknown',
        compressionEnabled: false,
        heartbleed: false,
        poodle: false,
        beast: false,
        freak: false,
        logjam: false,
        drowned: false,
        robot: false,
        ticketbleed: false,
        zombie_poodle: false,
        golden_doodle: false,
      };
    } catch {
      return null as any;
    }
  }

  private parseVirusTotalResult(
    urlData: Record<string, unknown>,
    domainData: Record<string, unknown>,
    url: string,
    domain: string,
  ): VirusTotalResult {
    const urlAttrs = (urlData as any)?.data?.attributes || {};
    const domainAttrs = (domainData as any)?.data?.attributes || {};
    const stats = urlAttrs.last_analysis_stats || {};
    const results = urlAttrs.last_analysis_results || {};

    return {
      url,
      domain,
      reputation: domainAttrs.reputation || 0,
      malicious: stats.malicious || 0,
      suspicious: stats.suspicious || 0,
      clean: stats.harmless || 0,
      undetected: stats.undetected || 0,
      timeout: stats.timeout || 0,
      totalEngines: Object.keys(results).length,
      categories: domainAttrs.categories || {},
      lastAnalysisDate: urlAttrs.last_analysis_date
        ? new Date((urlAttrs.last_analysis_date as number) * 1000).toISOString()
        : '',
      firstSubmissionDate: urlAttrs.first_submission_date
        ? new Date((urlAttrs.first_submission_date as number) * 1000).toISOString()
        : '',
      lastModificationDate: urlAttrs.last_modification_date
        ? new Date((urlAttrs.last_modification_date as number) * 1000).toISOString()
        : '',
      timesSubmitted: urlAttrs.times_submitted || 0,
      tags: urlAttrs.tags || [],
      threatNames: urlAttrs.threat_names || [],
    };
  }

  private parseRDAPResult(data: Record<string, unknown>, domain: string): RDAPResult {
    const events = ((data.events as any[]) || []).map((e: any) => ({
      eventAction: e.eventAction,
      eventDate: e.eventDate,
    }));

    const createdEvent = events.find((e) => e.eventAction === 'registration');
    const expiresEvent = events.find((e) => e.eventAction === 'expiration');
    const updatedEvent = events.find((e) => e.eventAction === 'last changed');

    const ageInDays = createdEvent?.eventDate
      ? Math.floor(
          (Date.now() - new Date(createdEvent.eventDate).getTime()) / 86400000,
        )
      : undefined;

    const entities = ((data.entities as any[]) || []).map((e: any) => ({
      handle: e.handle || '',
      roles: e.roles || [],
      email:
        (e.vcardArray?.[1] || [])
          .find((v: any[]) => v[0] === 'email')?.[3] || undefined,
    }));

    const registrar = entities.find((e) => e.roles.includes('registrar'));

    return {
      domain: (data.ldhName as string) || domain,
      handle: (data.handle as string) || '',
      ldhName: (data.ldhName as string) || domain,
      status: (data.status as string[]) || [],
      events,
      entities,
      nameservers: ((data.nameservers as any[]) || []).map((ns: any) =>
        ns.ldhName || ns,
      ),
      secureDNS: data.secureDNS as any,
      links: ((data.links as any[]) || []).map((l: any) => l.href),
      notices: ((data.notices as any[]) || []).map((n: any) => n.title),
      registrar: registrar?.handle || '',
      createdDate: createdEvent?.eventDate,
      updatedDate: updatedEvent?.eventDate,
      expiresDate: expiresEvent?.eventDate,
      ageInDays,
      isDomainFresh: ageInDays !== undefined && ageInDays < 90,
    };
  }

  private extractSSLVulnerabilities(details: Record<string, unknown>) {
    const vulns = [];
    if ((details as any).heartbleed) vulns.push({ name: 'Heartbleed', severity: 'critical' as const, description: 'OpenSSL heartbleed vulnerability', cve: 'CVE-2014-0160', cvss: 7.5, remediation: 'Update OpenSSL to 1.0.1g+' });
    if ((details as any).poodle) vulns.push({ name: 'POODLE', severity: 'high' as const, description: 'SSLv3 POODLE attack', cve: 'CVE-2014-3566', cvss: 3.4, remediation: 'Disable SSLv3' });
    if ((details as any).freak) vulns.push({ name: 'FREAK', severity: 'high' as const, description: 'Export-grade cipher downgrade', cve: 'CVE-2015-0204', cvss: 4.3, remediation: 'Disable export cipher suites' });
    if ((details as any).logjam) vulns.push({ name: 'Logjam', severity: 'high' as const, description: 'Weak Diffie-Hellman key exchange', cve: 'CVE-2015-4000', cvss: 3.7, remediation: 'Use DHE >= 2048-bit parameters' });
    if ((details as any).drownVulnerable) vulns.push({ name: 'DROWN', severity: 'critical' as const, description: 'Decrypting RSA with Obsolete and Weakened eNcryption', cve: 'CVE-2016-0800', cvss: 5.9, remediation: 'Disable SSLv2 on all servers' });
    return vulns;
  }

  private parseCipherSuites(suites: any[]) {
    return (suites[0]?.list || []).map((s: any) => ({
      name: s.name,
      strength: s.q === 0 ? 'strong' : s.q === 1 ? 'acceptable' : 'weak' as any,
      protocol: s.kxType || '',
      keyExchange: s.kxType || '',
      authentication: s.authType || '',
      encryption: s.encType || '',
      mac: s.macType || '',
    }));
  }

  private parseProtocols(protocols: any[]) {
    const secureVersions = ['TLS 1.2', 'TLS 1.3'];
    return protocols.map((p: any) => ({
      name: p.name,
      version: p.version,
      enabled: !p.q,
      secure: secureVersions.some((sv) => `${p.name} ${p.version}`.includes(sv)),
    }));
  }

  private async submitURLToVirusTotal(url: string, apiKey: string): Promise<void> {
    const formData = new URLSearchParams({ url });
    await undiciRequest('https://www.virustotal.com/api/v3/urls', {
      method: 'POST',
      headers: {
        'x-apikey': apiKey,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
      headersTimeout: 30000,
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
