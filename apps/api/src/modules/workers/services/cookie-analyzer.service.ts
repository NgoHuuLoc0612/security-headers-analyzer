// apps/api/src/modules/workers/services/cookie-analyzer.service.ts
import { Injectable } from '@nestjs/common';
import type { CookieAnalysis, CookieIssue, HeaderSeverity } from '@sha/types';

@Injectable()
export class CookieAnalyzerService {
  async analyze(setCookieHeader: string): Promise<CookieAnalysis[]> {
    if (!setCookieHeader) return [];

    // Split multiple Set-Cookie headers (they're concatenated with \n in our case)
    const cookieStrings = setCookieHeader.split(/\n|,(?=[^;])/g).filter(Boolean);

    return cookieStrings.map((cookieStr) => this.analyzeCookie(cookieStr.trim()));
  }

  private analyzeCookie(cookieStr: string): CookieAnalysis {
    const parts = cookieStr.split(';').map((p) => p.trim());
    const [nameValue, ...attributes] = parts;
    const [name, ...valueParts] = (nameValue || '').split('=');
    const value = valueParts.join('=');

    const attrMap: Record<string, string> = {};
    for (const attr of attributes) {
      const [key, val] = attr.split('=');
      attrMap[key.toLowerCase().trim()] = (val || '').trim();
    }

    const httpOnly = 'httponly' in attrMap;
    const secure = 'secure' in attrMap;
    const sameSite = attrMap['samesite'] as CookieAnalysis['sameSite'];
    const domain = attrMap['domain'];
    const path = attrMap['path'] || '/';
    const expires = attrMap['expires'];
    const maxAge = attrMap['max-age'] ? parseInt(attrMap['max-age'], 10) : undefined;

    const issues: CookieIssue[] = [];
    let score = 100;

    // HttpOnly check
    if (!httpOnly) {
      issues.push({
        type: 'missing-httponly',
        severity: 'high',
        message: 'Cookie is accessible to JavaScript (HttpOnly missing)',
        recommendation: 'Add HttpOnly flag to prevent XSS-based cookie theft',
      });
      score -= 30;
    }

    // Secure check
    if (!secure) {
      issues.push({
        type: 'missing-secure',
        severity: 'high',
        message: 'Cookie transmitted over HTTP (Secure flag missing)',
        recommendation: 'Add Secure flag to prevent transmission over unencrypted connections',
      });
      score -= 30;
    }

    // SameSite check
    if (!sameSite) {
      issues.push({
        type: 'missing-samesite',
        severity: 'medium',
        message: 'No SameSite attribute — vulnerable to CSRF attacks',
        recommendation: 'Add SameSite=Strict or SameSite=Lax',
      });
      score -= 20;
    } else if (sameSite === 'None' && !secure) {
      issues.push({
        type: 'samesite-none-insecure',
        severity: 'high',
        message: 'SameSite=None requires Secure flag',
        recommendation: 'Add Secure flag when using SameSite=None',
      });
      score -= 25;
    }

    // Check for session cookies with long expiry
    if (name.toLowerCase().includes('session') && maxAge && maxAge > 86400) {
      issues.push({
        type: 'long-session',
        severity: 'low',
        message: `Session cookie with long max-age (${maxAge}s)`,
        recommendation: 'Consider shorter session duration for security',
      });
      score -= 5;
    }

    // Check for weak naming patterns
    if (name.startsWith('__Secure-') && !secure) {
      issues.push({
        type: 'secure-prefix-violation',
        severity: 'high',
        message: '__Secure- prefixed cookie must have Secure flag',
        recommendation: 'Add Secure flag to comply with __Secure- prefix requirements',
      });
      score -= 20;
    }

    if (name.startsWith('__Host-') && (!secure || domain || path !== '/')) {
      issues.push({
        type: 'host-prefix-violation',
        severity: 'high',
        message: '__Host- prefix requires: Secure, no Domain, Path=/',
        recommendation: 'Fix cookie attributes to comply with __Host- prefix',
      });
      score -= 20;
    }

    score = Math.max(0, score);

    const risk: HeaderSeverity =
      score >= 80 ? 'info'
      : score >= 60 ? 'low'
      : score >= 40 ? 'medium'
      : score >= 20 ? 'high'
      : 'critical';

    return {
      name: name.trim(),
      value: value.substring(0, 50) + (value.length > 50 ? '...' : ''),
      domain,
      path,
      httpOnly,
      secure,
      sameSite,
      expires,
      maxAge,
      issues,
      risk,
      score,
    };
  }
}
