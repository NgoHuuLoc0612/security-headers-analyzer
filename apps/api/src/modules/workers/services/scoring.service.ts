// apps/api/src/modules/workers/services/scoring.service.ts
import { Injectable } from '@nestjs/common';
import type {
  SecurityScore,
  SecurityGrade,
  HeaderAnalysis,
  CSPAnalysis,
  CookieAnalysis,
  CategoryScore,
  ScoreBreakdown,
  Improvement,
  RiskProfile,
  ComplianceStatus,
  HeaderSeverity,
} from '@sha/types';

interface ScoringInput {
  headers: HeaderAnalysis[];
  csp: CSPAnalysis | null;
  cookies: CookieAnalysis[];
  tls: Record<string, unknown> | null;
  reputation: Record<string, unknown> | null;
  dns: Record<string, unknown> | null;
}

@Injectable()
export class ScoringService {
  calculate(input: ScoringInput): SecurityScore {
    const headerCat = this.scoreHeaders(input.headers);
    const tlsCat = this.scoreTLS(input.tls);
    const cspCat = this.scoreCSP(input.csp, input.headers);
    const cookieCat = this.scoreCookies(input.cookies);
    const dnsCat = this.scoreDNS(input.dns);
    const reputationCat = this.scoreReputation(input.reputation);

    // Weighted overall score
    const weights = {
      headers: 0.25,
      tls: 0.25,
      csp: 0.20,
      cookies: 0.10,
      dns: 0.10,
      reputation: 0.10,
    };

    const overall =
      (headerCat.score / headerCat.maxScore) * weights.headers * 100 +
      (tlsCat.score / tlsCat.maxScore) * weights.tls * 100 +
      (cspCat.score / cspCat.maxScore) * weights.csp * 100 +
      (cookieCat.score / cookieCat.maxScore) * weights.cookies * 100 +
      (dnsCat.score / dnsCat.maxScore) * weights.dns * 100 +
      (reputationCat.score / reputationCat.maxScore) * weights.reputation * 100;

    const roundedScore = Math.round(overall * 10) / 10;
    const grade = this.scoreToGrade(roundedScore);

    const breakdown = this.buildBreakdown(input);
    const improvements = this.buildImprovements(input, breakdown);
    const riskProfile = this.assessRisk(input);
    const compliance = this.assessCompliance(input, roundedScore);

    return {
      overall: roundedScore,
      grade,
      categories: {
        headers: headerCat,
        tls: tlsCat,
        csp: cspCat,
        cookies: cookieCat,
        dns: dnsCat,
        reputation: reputationCat,
      },
      breakdown,
      improvements,
      riskProfile,
      complianceStatus: compliance,
    };
  }

  // ─── Category scorers ──────────────────────────────────────
  private scoreHeaders(headers: HeaderAnalysis[]): CategoryScore {
    const totalScore = headers.reduce((sum, h) => sum + h.score, 0);
    const totalMax = headers.reduce((sum, h) => sum + h.maxScore, 0) || 1;
    const pct = (totalScore / totalMax) * 100;

    return {
      score: totalScore,
      maxScore: totalMax,
      weight: 0.25,
      grade: this.scoreToGrade(pct),
      label: 'Security Headers',
      color: this.gradeToColor(this.scoreToGrade(pct)),
    };
  }

  private scoreTLS(tls: Record<string, unknown> | null): CategoryScore {
    if (!tls) return { score: 0, maxScore: 100, weight: 0.25, grade: 'F', label: 'TLS/SSL', color: '#ef4444' };

    const grade = (tls.grade as string) || 'F';
    const gradeScoreMap: Record<string, number> = {
      'A+': 100, 'A': 90, 'B': 75, 'C': 60, 'D': 45, 'E': 30, 'F': 10, 'N/A': 50,
    };
    const score = gradeScoreMap[grade] ?? 50;

    return {
      score,
      maxScore: 100,
      weight: 0.25,
      grade: this.scoreToGrade(score),
      label: 'TLS/SSL',
      color: this.gradeToColor(this.scoreToGrade(score)),
    };
  }

  private scoreCSP(
    csp: CSPAnalysis | null,
    headers: HeaderAnalysis[],
  ): CategoryScore {
    const cspHeader = headers.find((h) => h.name === 'content-security-policy');
    const rawScore = cspHeader?.score ?? 0;
    const rawMax = cspHeader?.maxScore ?? 25;
    const pct = (rawScore / rawMax) * 100;

    return {
      score: rawScore,
      maxScore: rawMax,
      weight: 0.20,
      grade: this.scoreToGrade(pct),
      label: 'Content Security Policy',
      color: this.gradeToColor(this.scoreToGrade(pct)),
    };
  }

  private scoreCookies(cookies: CookieAnalysis[]): CategoryScore {
    if (!cookies.length) return { score: 75, maxScore: 100, weight: 0.10, grade: 'B', label: 'Cookies', color: '#f59e0b' };

    const totalScore = cookies.reduce((sum, c) => sum + c.score, 0);
    const totalMax = cookies.length * 100;
    const pct = (totalScore / totalMax) * 100;

    return {
      score: totalScore,
      maxScore: totalMax,
      weight: 0.10,
      grade: this.scoreToGrade(pct),
      label: 'Cookie Security',
      color: this.gradeToColor(this.scoreToGrade(pct)),
    };
  }

  private scoreDNS(dns: Record<string, unknown> | null): CategoryScore {
    if (!dns) return { score: 50, maxScore: 100, weight: 0.10, grade: 'C', label: 'DNS Security', color: '#f59e0b' };

    let score = 50;
    if ((dns as any).dnssec) score += 20;
    if ((dns as any).dmarc) score += 10;
    if ((dns as any).spf) score += 10;
    if ((dns as any).dkim) score += 10;

    score = Math.min(100, score);

    return {
      score,
      maxScore: 100,
      weight: 0.10,
      grade: this.scoreToGrade(score),
      label: 'DNS Security',
      color: this.gradeToColor(this.scoreToGrade(score)),
    };
  }

  private scoreReputation(rep: Record<string, unknown> | null): CategoryScore {
    if (!rep) return { score: 75, maxScore: 100, weight: 0.10, grade: 'B', label: 'Reputation', color: '#f59e0b' };

    const malicious = (rep.malicious as number) || 0;
    const suspicious = (rep.suspicious as number) || 0;
    const totalEngines = (rep.totalEngines as number) || 1;

    let score = 100;
    score -= (malicious / totalEngines) * 100;
    score -= (suspicious / totalEngines) * 50;
    if (rep.isDomainFresh) score -= 15;
    score = Math.max(0, Math.round(score));

    return {
      score,
      maxScore: 100,
      weight: 0.10,
      grade: this.scoreToGrade(score),
      label: 'Reputation',
      color: this.gradeToColor(this.scoreToGrade(score)),
    };
  }

  // ─── Risk profile ──────────────────────────────────────────
  private assessRisk(input: ScoringInput): RiskProfile {
    const headers = input.headers;
    const cspHeader = headers.find((h) => h.name === 'content-security-policy');
    const xfo = headers.find((h) => h.name === 'x-frame-options');
    const hsts = headers.find((h) => h.name === 'strict-transport-security');
    const xcto = headers.find((h) => h.name === 'x-content-type-options');

    const xssRisk: HeaderSeverity =
      !cspHeader || cspHeader.status === 'missing' ? 'critical'
      : cspHeader.score < 10 ? 'high'
      : cspHeader.score < 18 ? 'medium' : 'low';

    const clickjackingRisk: HeaderSeverity =
      !xfo || xfo.status === 'missing' ? 'high'
      : xfo.score < 8 ? 'medium' : 'low';

    const mitmRisk: HeaderSeverity =
      !hsts || hsts.status === 'missing' ? 'critical'
      : hsts.score < 8 ? 'high' : 'low';

    const dataLeakageRisk: HeaderSeverity =
      (headers.find((h) => h.name === 'referrer-policy')?.score ?? 0) < 3
        ? 'medium' : 'low';

    const codeInjectionRisk: HeaderSeverity =
      !xcto || xcto.status === 'missing' ? 'medium' : 'low';

    const cryptoRisk: HeaderSeverity =
      input.tls && (input.tls as any).heartbleed ? 'critical'
      : input.tls && (input.tls as any).grade === 'F' ? 'critical'
      : input.tls && ['D', 'E'].includes((input.tls as any).grade) ? 'high' : 'low';

    const risks = [xssRisk, clickjackingRisk, mitmRisk, dataLeakageRisk, codeInjectionRisk, cryptoRisk];
    const overallRisk: HeaderSeverity =
      risks.includes('critical') ? 'critical'
      : risks.filter((r) => r === 'high').length >= 2 ? 'high'
      : risks.includes('high') ? 'medium' : 'low';

    return { xssRisk, clickjackingRisk, mitmRisk, dataLeakageRisk, codeInjectionRisk, cryptoRisk, overallRisk };
  }

  // ─── Compliance ─────────────────────────────────────────────
  private assessCompliance(input: ScoringInput, overall: number): ComplianceStatus {
    const headers = input.headers;
    const hasHSTS = headers.find((h) => h.name === 'strict-transport-security')?.score > 0;
    const hasCSP = headers.find((h) => h.name === 'content-security-policy')?.score > 0;
    const hasXFO = headers.find((h) => h.name === 'x-frame-options')?.score > 0;
    const tlsGrade = (input.tls as any)?.grade;

    return {
      pciDss: {
        compliant: !!(hasHSTS && tlsGrade && !['D', 'E', 'F'].includes(tlsGrade)),
        score: hasHSTS && tlsGrade && !['D', 'E', 'F'].includes(tlsGrade) ? 100 : 40,
        issues: [
          ...(!hasHSTS ? ['HSTS not enabled (PCI DSS 4.2.1)'] : []),
          ...(tlsGrade && ['D', 'E', 'F'].includes(tlsGrade) ? [`TLS grade ${tlsGrade} fails PCI DSS`] : []),
        ],
        recommendations: ['Enable HSTS with preload', 'Use TLS 1.2+ only'],
      },
      gdpr: {
        compliant: !!(hasCSP && overall >= 60),
        score: overall >= 70 ? 80 : 40,
        issues: [...(!hasCSP ? ['No CSP increases data exfiltration risk'] : [])],
        recommendations: ['Implement strict CSP to prevent data exfiltration'],
      },
      hipaa: {
        compliant: !!(hasHSTS && hasCSP && overall >= 70),
        score: overall >= 70 ? 75 : 35,
        issues: [
          ...(!hasHSTS ? ['HSTS required for HIPAA compliance'] : []),
          ...(!hasCSP ? ['CSP required for HIPAA compliance'] : []),
        ],
        recommendations: ['All PHI transport must use TLS 1.2+'],
      },
      owasp: {
        compliant: overall >= 70,
        score: overall,
        issues: input.headers
          .filter((h) => h.status === 'missing' && h.severity === 'critical')
          .map((h) => `${h.name} missing (OWASP A05)`),
        recommendations: ['Review OWASP Secure Headers Project'],
      },
      nist: {
        compliant: overall >= 75,
        score: overall,
        issues: [],
        recommendations: ['Follow NIST SP 800-44 guidelines'],
      },
      cis: {
        compliant: !!(hasHSTS && hasXFO && hasCSP),
        score: [hasHSTS, hasXFO, hasCSP].filter(Boolean).length * 33,
        issues: [],
        recommendations: ['Follow CIS Benchmark for web servers'],
      },
    };
  }

  // ─── Breakdown ─────────────────────────────────────────────
  private buildBreakdown(input: ScoringInput): ScoreBreakdown[] {
    const breakdown: ScoreBreakdown[] = [];

    for (const h of input.headers) {
      breakdown.push({
        category: 'headers',
        item: h.name,
        score: h.score,
        maxScore: h.maxScore,
        impact: h.severity === 'critical' ? 'critical' : h.severity === 'high' ? 'high' : h.severity === 'medium' ? 'medium' : 'low',
        status: h.status,
      });
    }

    return breakdown;
  }

  // ─── Improvements ──────────────────────────────────────────
  private buildImprovements(input: ScoringInput, breakdown: ScoreBreakdown[]): Improvement[] {
    const improvements: Improvement[] = [];
    let priority = 1;

    const criticalMissing = input.headers.filter(
      (h) => h.status === 'missing' && h.severity === 'critical',
    );

    for (const h of criticalMissing) {
      improvements.push({
        priority: priority++,
        category: 'headers',
        header: h.name,
        action: h.recommendation,
        impact: `Adds up to ${h.maxScore} points to your score`,
        effort: 'trivial',
        scoreGain: h.maxScore,
        references: h.references,
      });
    }

    const highMissing = input.headers.filter(
      (h) => (h.status === 'missing' || h.status === 'misconfigured') && h.severity === 'high',
    );

    for (const h of highMissing) {
      improvements.push({
        priority: priority++,
        category: 'headers',
        header: h.name,
        action: h.recommendation,
        impact: `Adds ${h.maxScore - h.score} points and reduces risk`,
        effort: 'low',
        scoreGain: h.maxScore - h.score,
        references: h.references,
      });
    }

    if (!input.tls || (input.tls as any).grade === 'F') {
      improvements.push({
        priority: priority++,
        category: 'tls',
        header: 'TLS/SSL Configuration',
        action: 'Upgrade TLS configuration — disable TLS 1.0/1.1, prefer TLS 1.3, use strong cipher suites',
        impact: 'Critical for data security and PCI compliance',
        effort: 'medium',
        scoreGain: 25,
        references: ['https://ssl-config.mozilla.org/'],
      });
    }

    return improvements.slice(0, 20);
  }

  // ─── Helpers ──────────────────────────────────────────────
  scoreToGrade(score: number): SecurityGrade {
    if (score >= 95) return 'A+';
    if (score >= 85) return 'A';
    if (score >= 75) return 'B';
    if (score >= 60) return 'C';
    if (score >= 45) return 'D';
    if (score >= 30) return 'E';
    return 'F';
  }

  gradeToColor(grade: SecurityGrade): string {
    const colorMap: Record<SecurityGrade, string> = {
      'A+': '#10b981',
      'A':  '#22c55e',
      'B':  '#84cc16',
      'C':  '#f59e0b',
      'D':  '#f97316',
      'E':  '#ef4444',
      'F':  '#dc2626',
    };
    return colorMap[grade] || '#6b7280';
  }
}
