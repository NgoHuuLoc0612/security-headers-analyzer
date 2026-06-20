// apps/api/src/modules/workers/services/csp-analyzer.service.ts
import { Injectable } from '@nestjs/common';
import type { CSPAnalysis, CSPViolation, HeaderSeverity } from '@sha/types';

@Injectable()
export class CSPAnalyzerService {
  async analyze(cspHeader: string | null): Promise<CSPAnalysis> {
    if (!cspHeader) {
      return {
        raw: null,
        parsed: {},
        grade: 'F',
        score: 0,
        unsafeDirectives: [],
        missingDirectives: ['default-src', 'script-src', 'style-src', 'img-src'],
        wildcardSources: [],
        nonces: [],
        hashes: [],
        violations: [],
        bypassRisks: ['No CSP — XSS fully exploitable'],
        reportingEnabled: false,
        strictMode: false,
      };
    }

    const parsed = this.parse(cspHeader);
    const violations: CSPViolation[] = [];
    const unsafeDirectives: string[] = [];
    const wildcardSources: string[] = [];
    const bypassRisks: string[] = [];

    let score = 100;

    // Check each directive
    for (const [directive, sources] of Object.entries(parsed)) {
      for (const source of sources) {
        if (source === "'unsafe-eval'") {
          violations.push({ directive, source, severity: 'critical', message: "unsafe-eval allows eval(), new Function() — major XSS risk" });
          unsafeDirectives.push(`${directive}: unsafe-eval`);
          score -= 30;
        }
        if (source === "'unsafe-inline'" && !this.hasNonceOrHash(parsed, directive)) {
          violations.push({ directive, source, severity: 'high', message: "unsafe-inline without nonce/hash effectively disables CSP for this directive" });
          unsafeDirectives.push(`${directive}: unsafe-inline`);
          score -= 20;
        }
        if (source === '*') {
          violations.push({ directive, source, severity: 'high', message: "Wildcard * allows loading from any origin" });
          wildcardSources.push(directive);
          score -= 15;
          bypassRisks.push(`${directive} wildcard — can load malicious resources`);
        }
        if (source.startsWith('http:') && !source.startsWith('http://localhost')) {
          violations.push({ directive, source, severity: 'medium', message: "http: scheme allows insecure resource loading" });
          score -= 10;
        }
        if (source === 'data:' && ['script-src', 'default-src'].includes(directive)) {
          violations.push({ directive, source, severity: 'medium', message: "data: URI in script context enables XSS" });
          score -= 8;
          bypassRisks.push('data: URI in script-src can be used for XSS');
        }
      }
    }

    const requiredDirectives = ['default-src', 'script-src', 'style-src', 'img-src', 'connect-src'];
    const missingDirectives = requiredDirectives.filter((d) => !parsed[d] && !parsed['default-src']);

    if (missingDirectives.includes('default-src')) {
      score -= 20;
      bypassRisks.push('No default-src — fallback behavior undefined');
    }

    const hasStrictDynamic = Object.values(parsed).flat().includes("'strict-dynamic'");
    if (hasStrictDynamic) score = Math.min(score + 10, 100);

    const reportingEnabled = !!(parsed['report-uri'] || parsed['report-to']);
    if (reportingEnabled) score = Math.min(score + 5, 100);

    const strictMode = hasStrictDynamic && !unsafeDirectives.length;

    const nonces = this.extractNonces(cspHeader);
    const hashes = this.extractHashes(cspHeader);

    score = Math.max(0, score);

    const grade = this.scoreToGrade(score);

    return {
      raw: cspHeader,
      parsed,
      grade,
      score,
      unsafeDirectives,
      missingDirectives,
      wildcardSources,
      nonces,
      hashes,
      violations,
      bypassRisks,
      reportingEnabled,
      strictMode,
    };
  }

  private parse(header: string): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    const directives = header.split(';').map((d) => d.trim()).filter(Boolean);

    for (const directive of directives) {
      const parts = directive.split(/\s+/);
      const name = parts[0].toLowerCase();
      const sources = parts.slice(1);
      result[name] = sources;
    }

    return result;
  }

  private hasNonceOrHash(parsed: Record<string, string[]>, directive: string): boolean {
    const sources = parsed[directive] || parsed['default-src'] || [];
    return sources.some(
      (s) => s.startsWith("'nonce-") || s.match(/'sha(256|384|512)-/),
    );
  }

  private extractNonces(header: string): string[] {
    const matches = header.match(/'nonce-([A-Za-z0-9+/=]+)'/g) || [];
    return matches.map((m) => m.replace(/^'nonce-|'$/g, ''));
  }

  private extractHashes(header: string): string[] {
    const matches = header.match(/'sha(?:256|384|512)-[A-Za-z0-9+/=]+'/g) || [];
    return matches;
  }

  private scoreToGrade(score: number): CSPAnalysis['grade'] {
    if (score >= 95) return 'A+';
    if (score >= 85) return 'A';
    if (score >= 70) return 'B';
    if (score >= 55) return 'C';
    if (score >= 40) return 'D';
    if (score > 0)   return 'F';
    return 'N/A';
  }
}
