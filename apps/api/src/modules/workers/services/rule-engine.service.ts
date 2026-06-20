// apps/api/src/modules/workers/services/rule-engine.service.ts
import { Injectable, Logger } from '@nestjs/common';
import type { HeaderAnalysis, HeaderSeverity, HeaderStatus } from '@sha/types';

interface HeaderRule {
  name: string;
  displayName: string;
  maxScore: number;
  severity: HeaderSeverity;
  required: boolean;
  check: (value: string | null, allHeaders: Record<string, string>) => HeaderAnalysis;
}

@Injectable()
export class RuleEngineService {
  private readonly logger = new Logger(RuleEngineService.name);
  private readonly rules: HeaderRule[] = this.buildRules();

  async analyzeSecurityHeaders(
    headers: Record<string, string>,
  ): Promise<HeaderAnalysis[]> {
    return this.rules.map((rule) => {
      const value = headers[rule.name.toLowerCase()] || null;
      try {
        return rule.check(value, headers);
      } catch (err) {
        this.logger.warn(`Rule error for ${rule.name}: ${(err as Error).message}`);
        return {
          name: rule.name,
          value,
          status: 'missing' as HeaderStatus,
          severity: rule.severity,
          score: 0,
          maxScore: rule.maxScore,
          recommendation: 'Error analyzing this header',
          details: '',
          references: [],
        };
      }
    });
  }

  async runAllRules(context: {
    headers: Record<string, string>;
    tls: unknown;
    reputation: unknown;
    registration: unknown;
  }): Promise<Record<string, unknown>> {
    const headerResults = await this.analyzeSecurityHeaders(context.headers);

    // Additional context-aware rules
    const tlsRules = this.runTLSContextRules(context.tls as any);
    const reputationRules = this.runReputationRules(context.reputation as any);

    return {
      headerResults,
      tlsRules,
      reputationRules,
      timestamp: new Date().toISOString(),
    };
  }

  private runTLSContextRules(tls: Record<string, unknown> | null) {
    if (!tls) return { status: 'skipped' };
    return {
      hasValidCert: !!(tls as any).certValid,
      hasHSTS: !!(tls as any).hsts,
      hasForwardSecrecy: (tls as any).forwardSecrecy === 'strong',
      hasModernProtocol: (tls as any).protocol?.includes('1.3'),
      vulnerabilities: (tls as any).vulnerabilities?.length || 0,
    };
  }

  private runReputationRules(vt: Record<string, unknown> | null) {
    if (!vt) return { status: 'skipped' };
    return {
      isMalicious: ((vt as any).malicious || 0) > 0,
      isSuspicious: ((vt as any).suspicious || 0) > 0,
      reputation: (vt as any).reputation || 0,
      threatNames: (vt as any).threatNames || [],
    };
  }

  // ─── Build all rules ──────────────────────────────────────
  private buildRules(): HeaderRule[] {
    return [
      // ─── CSP ───────────────────────────────────────────────
      {
        name: 'content-security-policy',
        displayName: 'Content-Security-Policy',
        maxScore: 25,
        severity: 'critical',
        required: true,
        check: (value) => {
          if (!value) {
            return {
              name: 'content-security-policy',
              value: null,
              status: 'missing',
              severity: 'critical',
              score: 0,
              maxScore: 25,
              recommendation: 'Add a Content-Security-Policy header to prevent XSS attacks. Start with: Content-Security-Policy: default-src \'self\'',
              details: 'CSP missing — the most impactful security header. Without it, the site is vulnerable to Cross-Site Scripting (XSS) attacks.',
              references: ['https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP', 'https://csp.withgoogle.com/'],
              cweIds: ['CWE-79', 'CWE-116'],
              owaspCategory: 'A03:2021-Injection',
            };
          }

          let score = 15;
          const issues: string[] = [];
          const directives = value.toLowerCase();

          // Penalize unsafe directives
          if (directives.includes("'unsafe-eval'")) { score -= 8; issues.push("'unsafe-eval' allows arbitrary JS execution"); }
          if (directives.includes("'unsafe-inline'") && !directives.includes('nonce-') && !directives.includes('sha')) {
            score -= 6; issues.push("'unsafe-inline' without nonce/hash defeats CSP purpose");
          }
          if (directives.includes('*')) { score -= 5; issues.push('Wildcard (*) source is overly permissive'); }

          // Reward good directives
          if (directives.includes('default-src')) score += 3;
          if (directives.includes("'strict-dynamic'")) score += 3;
          if (directives.includes('nonce-') || directives.match(/sha(256|384|512)-/)) score += 4;
          if (directives.includes('upgrade-insecure-requests')) score += 1;
          if (directives.includes('report-uri') || directives.includes('report-to')) score += 1;
          if (!directives.includes('http:')) score += 1;

          score = Math.max(0, Math.min(25, score));

          return {
            name: 'content-security-policy',
            value,
            status: issues.length === 0 ? 'present' : 'misconfigured',
            severity: issues.length > 0 ? 'high' : 'info',
            score,
            maxScore: 25,
            recommendation: issues.length > 0
              ? `Fix CSP issues: ${issues[0]}`
              : 'CSP is well-configured',
            details: issues.length > 0
              ? `Found ${issues.length} issues: ${issues.join('; ')}`
              : 'CSP is properly configured with strong directives',
            references: ['https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP'],
            cweIds: ['CWE-79'],
            owaspCategory: 'A03:2021-Injection',
          };
        },
      },

      // ─── HSTS ──────────────────────────────────────────────
      {
        name: 'strict-transport-security',
        displayName: 'Strict-Transport-Security',
        maxScore: 15,
        severity: 'critical',
        required: true,
        check: (value) => {
          if (!value) {
            return {
              name: 'strict-transport-security',
              value: null,
              status: 'missing',
              severity: 'critical',
              score: 0,
              maxScore: 15,
              recommendation: 'Add HSTS: Strict-Transport-Security: max-age=31536000; includeSubDomains; preload',
              details: 'HSTS missing — site is vulnerable to HTTPS downgrade attacks and SSL stripping.',
              references: ['https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Strict-Transport-Security'],
              cweIds: ['CWE-319'],
              owaspCategory: 'A02:2021-Cryptographic_Failures',
            };
          }

          let score = 8;
          const issues: string[] = [];
          const lower = value.toLowerCase();

          const maxAgeMatch = lower.match(/max-age=(\d+)/);
          const maxAge = maxAgeMatch ? parseInt(maxAgeMatch[1], 10) : 0;

          if (maxAge < 86400) { score -= 3; issues.push(`max-age=${maxAge} is too low (minimum 86400s)`); }
          else if (maxAge >= 31536000) score += 3;
          else if (maxAge >= 15768000) score += 2;

          if (lower.includes('includesubdomains')) score += 2;
          if (lower.includes('preload')) score += 2;
          if (maxAge < 15768000) issues.push('Increase max-age to at least 15768000 (6 months)');

          score = Math.max(0, Math.min(15, score));

          return {
            name: 'strict-transport-security',
            value,
            status: issues.length === 0 ? 'present' : 'misconfigured',
            severity: issues.length > 0 ? 'high' : 'info',
            score,
            maxScore: 15,
            recommendation: issues.length > 0 ? issues[0] : 'HSTS is properly configured',
            details: `max-age=${maxAge}; includeSubDomains=${lower.includes('includesubdomains')}; preload=${lower.includes('preload')}`,
            references: ['https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Strict-Transport-Security'],
            cweIds: ['CWE-319'],
            owaspCategory: 'A02:2021-Cryptographic_Failures',
          };
        },
      },

      // ─── X-Frame-Options ──────────────────────────────────
      {
        name: 'x-frame-options',
        displayName: 'X-Frame-Options',
        maxScore: 10,
        severity: 'high',
        required: true,
        check: (value) => {
          if (!value) {
            return {
              name: 'x-frame-options',
              value: null,
              status: 'missing',
              severity: 'high',
              score: 0,
              maxScore: 10,
              recommendation: 'Add X-Frame-Options: DENY or use CSP frame-ancestors directive',
              details: 'Missing X-Frame-Options — site is vulnerable to clickjacking attacks.',
              references: ['https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Frame-Options'],
              cweIds: ['CWE-1021'],
              owaspCategory: 'A04:2021-Insecure_Design',
            };
          }

          const upper = value.toUpperCase().trim();
          let score = 5;
          let status: HeaderStatus = 'present';
          let recommendation = '';

          if (upper === 'DENY') { score = 10; recommendation = 'Optimal — DENY prevents all framing'; }
          else if (upper === 'SAMEORIGIN') { score = 8; recommendation = 'Good — only allows same-origin framing'; }
          else if (upper.startsWith('ALLOW-FROM')) { score = 4; status = 'misconfigured'; recommendation = 'ALLOW-FROM is deprecated and not widely supported. Use CSP frame-ancestors instead.'; }
          else { score = 2; status = 'misconfigured'; recommendation = `Invalid value "${value}". Use DENY or SAMEORIGIN`; }

          return {
            name: 'x-frame-options',
            value,
            status,
            severity: status === 'misconfigured' ? 'medium' : 'info',
            score,
            maxScore: 10,
            recommendation,
            details: `X-Frame-Options: ${value}`,
            references: ['https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Frame-Options'],
            cweIds: ['CWE-1021'],
            owaspCategory: 'A04:2021-Insecure_Design',
          };
        },
      },

      // ─── X-Content-Type-Options ────────────────────────────
      {
        name: 'x-content-type-options',
        displayName: 'X-Content-Type-Options',
        maxScore: 5,
        severity: 'medium',
        required: true,
        check: (value) => {
          if (!value) {
            return {
              name: 'x-content-type-options',
              value: null,
              status: 'missing',
              severity: 'medium',
              score: 0,
              maxScore: 5,
              recommendation: 'Add X-Content-Type-Options: nosniff',
              details: 'Missing X-Content-Type-Options — browser may MIME-sniff responses, enabling content injection.',
              references: ['https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Content-Type-Options'],
              cweIds: ['CWE-693'],
            };
          }

          const isNosniff = value.toLowerCase().trim() === 'nosniff';
          return {
            name: 'x-content-type-options',
            value,
            status: isNosniff ? 'present' : 'misconfigured',
            severity: isNosniff ? 'info' : 'medium',
            score: isNosniff ? 5 : 2,
            maxScore: 5,
            recommendation: isNosniff ? 'Correctly set to nosniff' : 'Value must be exactly "nosniff"',
            details: isNosniff ? 'MIME-sniffing is disabled' : `Invalid value: ${value}`,
            references: ['https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Content-Type-Options'],
            cweIds: ['CWE-693'],
          };
        },
      },

      // ─── Referrer-Policy ──────────────────────────────────
      {
        name: 'referrer-policy',
        displayName: 'Referrer-Policy',
        maxScore: 5,
        severity: 'medium',
        required: false,
        check: (value) => {
          if (!value) {
            return {
              name: 'referrer-policy',
              value: null,
              status: 'missing',
              severity: 'medium',
              score: 1,
              maxScore: 5,
              recommendation: 'Add Referrer-Policy: strict-origin-when-cross-origin',
              details: 'Missing Referrer-Policy — browser will use default behavior which may leak URL data.',
              references: ['https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Referrer-Policy'],
            };
          }

          const scoreMap: Record<string, number> = {
            'no-referrer': 5,
            'no-referrer-when-downgrade': 3,
            'origin': 4,
            'origin-when-cross-origin': 4,
            'same-origin': 4,
            'strict-origin': 5,
            'strict-origin-when-cross-origin': 5,
            'unsafe-url': 0,
            '': 1,
          };

          const score = scoreMap[value.toLowerCase()] ?? 2;
          const isWeak = value.toLowerCase() === 'unsafe-url';

          return {
            name: 'referrer-policy',
            value,
            status: score === 0 ? 'misconfigured' : 'present',
            severity: isWeak ? 'high' : score < 3 ? 'medium' : 'info',
            score,
            maxScore: 5,
            recommendation: isWeak
              ? '"unsafe-url" sends full URL to all destinations — highly insecure'
              : score >= 4
              ? 'Referrer-Policy is well-configured'
              : 'Consider stricter policy like strict-origin-when-cross-origin',
            details: `Policy: ${value}`,
            references: ['https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Referrer-Policy'],
          };
        },
      },

      // ─── Permissions-Policy ───────────────────────────────
      {
        name: 'permissions-policy',
        displayName: 'Permissions-Policy',
        maxScore: 10,
        severity: 'medium',
        required: false,
        check: (value) => {
          if (!value) {
            return {
              name: 'permissions-policy',
              value: null,
              status: 'missing',
              severity: 'medium',
              score: 2,
              maxScore: 10,
              recommendation: 'Add Permissions-Policy to control browser features: Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()',
              details: 'Missing Permissions-Policy — browser APIs may be accessible to third-party scripts.',
              references: ['https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Permissions-Policy'],
              owaspCategory: 'A05:2021-Security_Misconfiguration',
            };
          }

          const lower = value.toLowerCase();
          let score = 5;

          const dangerousPermissions = ['camera', 'microphone', 'geolocation', 'payment', 'usb', 'bluetooth', 'nfc'];
          const restricted = dangerousPermissions.filter((p) => lower.includes(`${p}=()`));
          score += Math.min(5, restricted.length);

          return {
            name: 'permissions-policy',
            value,
            status: 'present',
            severity: score >= 8 ? 'info' : 'low',
            score: Math.min(10, score),
            maxScore: 10,
            recommendation: restricted.length < 4
              ? `Consider restricting more APIs: ${dangerousPermissions.filter((p) => !restricted.includes(p)).join(', ')}`
              : 'Well-configured permissions policy',
            details: `Restricted: ${restricted.join(', ') || 'none of the dangerous APIs'}`,
            references: ['https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Permissions-Policy'],
          };
        },
      },

      // ─── Cross-Origin-Opener-Policy ────────────────────────
      {
        name: 'cross-origin-opener-policy',
        displayName: 'Cross-Origin-Opener-Policy',
        maxScore: 5,
        severity: 'medium',
        required: false,
        check: (value) => {
          if (!value) {
            return {
              name: 'cross-origin-opener-policy',
              value: null,
              status: 'missing',
              severity: 'medium',
              score: 1,
              maxScore: 5,
              recommendation: 'Add COOP: Cross-Origin-Opener-Policy: same-origin',
              details: 'Missing COOP — allows cross-origin pages to access window handle.',
              references: ['https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cross-Origin-Opener-Policy'],
              cweIds: ['CWE-346'],
            };
          }

          const scoreMap: Record<string, number> = {
            'same-origin': 5,
            'same-origin-allow-popups': 3,
            'unsafe-none': 1,
          };

          const score = scoreMap[value.toLowerCase()] ?? 2;

          return {
            name: 'cross-origin-opener-policy',
            value,
            status: score >= 3 ? 'present' : 'misconfigured',
            severity: score >= 3 ? 'info' : 'medium',
            score,
            maxScore: 5,
            recommendation: score >= 5 ? 'COOP optimally configured' : 'Use same-origin for maximum protection',
            details: `COOP: ${value}`,
            references: ['https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cross-Origin-Opener-Policy'],
          };
        },
      },

      // ─── Cross-Origin-Embedder-Policy ─────────────────────
      {
        name: 'cross-origin-embedder-policy',
        displayName: 'Cross-Origin-Embedder-Policy',
        maxScore: 5,
        severity: 'medium',
        required: false,
        check: (value) => {
          if (!value) {
            return {
              name: 'cross-origin-embedder-policy',
              value: null,
              status: 'missing',
              severity: 'low',
              score: 2,
              maxScore: 5,
              recommendation: 'Add COEP: Cross-Origin-Embedder-Policy: require-corp',
              details: 'Missing COEP — needed to enable SharedArrayBuffer and high-resolution timers.',
              references: ['https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cross-Origin-Embedder-Policy'],
            };
          }

          const isRequireCorp = value.toLowerCase() === 'require-corp';
          return {
            name: 'cross-origin-embedder-policy',
            value,
            status: isRequireCorp ? 'present' : 'misconfigured',
            severity: isRequireCorp ? 'info' : 'low',
            score: isRequireCorp ? 5 : 2,
            maxScore: 5,
            recommendation: isRequireCorp ? 'COEP correctly configured' : 'Use require-corp value',
            details: `COEP: ${value}`,
            references: ['https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cross-Origin-Embedder-Policy'],
          };
        },
      },

      // ─── X-XSS-Protection (deprecated but analyzed) ──────
      {
        name: 'x-xss-protection',
        displayName: 'X-XSS-Protection',
        maxScore: 3,
        severity: 'low',
        required: false,
        check: (value) => {
          if (!value) {
            return {
              name: 'x-xss-protection',
              value: null,
              status: 'missing',
              severity: 'low',
              score: 1,
              maxScore: 3,
              recommendation: 'This header is deprecated. Use CSP instead. If needed: X-XSS-Protection: 0',
              details: 'Legacy XSS auditor header — modern browsers ignore it. CSP is the correct solution.',
              references: ['https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-XSS-Protection'],
              cweIds: ['CWE-79'],
            };
          }

          const isDisabled = value.trim() === '0';
          const isEnabled = value.startsWith('1');
          const hasBlock = value.includes('mode=block');

          return {
            name: 'x-xss-protection',
            value,
            status: 'present',
            severity: 'info',
            score: isDisabled ? 3 : hasBlock ? 2 : 1,
            maxScore: 3,
            recommendation: isDisabled
              ? 'Correctly disabled (use CSP instead)'
              : 'Consider setting to 0 and using CSP for XSS protection',
            details: 'Deprecated header — supported by old IE/Chrome only',
            references: ['https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-XSS-Protection'],
          };
        },
      },

      // ─── Cache-Control ────────────────────────────────────
      {
        name: 'cache-control',
        displayName: 'Cache-Control',
        maxScore: 5,
        severity: 'medium',
        required: false,
        check: (value) => {
          if (!value) {
            return {
              name: 'cache-control',
              value: null,
              status: 'missing',
              severity: 'low',
              score: 2,
              maxScore: 5,
              recommendation: 'Add Cache-Control header. For sensitive pages: Cache-Control: no-store, no-cache',
              details: 'Missing Cache-Control — browsers may cache sensitive content.',
              references: ['https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control'],
            };
          }

          const lower = value.toLowerCase();
          const hasNoStore = lower.includes('no-store');
          const hasNoCache = lower.includes('no-cache');
          const hasPrivate = lower.includes('private');
          const hasPublic = lower.includes('public');

          let score = 3;
          let severity: HeaderSeverity = 'low';

          if (hasNoStore && hasNoCache) { score = 5; severity = 'info'; }
          else if (hasPrivate || hasNoCache) { score = 4; severity = 'info'; }
          else if (hasPublic) { score = 2; }

          return {
            name: 'cache-control',
            value,
            status: 'present',
            severity,
            score,
            maxScore: 5,
            recommendation: score < 4 ? 'Add no-store for sensitive pages to prevent caching' : 'Cache-Control is well configured',
            details: `Directives: ${value}`,
            references: ['https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control'],
          };
        },
      },

      // ─── Clear-Site-Data ──────────────────────────────────
      {
        name: 'clear-site-data',
        displayName: 'Clear-Site-Data',
        maxScore: 3,
        severity: 'low',
        required: false,
        check: (value) => {
          if (!value) {
            return {
              name: 'clear-site-data',
              value: null,
              status: 'missing',
              severity: 'info',
              score: 2,
              maxScore: 3,
              recommendation: 'Optional: Add Clear-Site-Data on logout pages',
              details: 'Informational — Clear-Site-Data can be useful for logout flows.',
              references: ['https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Clear-Site-Data'],
            };
          }
          return {
            name: 'clear-site-data',
            value,
            status: 'present',
            severity: 'info',
            score: 3,
            maxScore: 3,
            recommendation: 'Clear-Site-Data is present',
            details: `Clears: ${value}`,
            references: ['https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Clear-Site-Data'],
          };
        },
      },
    ];
  }
}
