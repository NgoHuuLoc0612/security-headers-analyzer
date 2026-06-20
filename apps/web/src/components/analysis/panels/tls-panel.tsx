'use client';
// apps/web/src/components/analysis/panels/tls-panel.tsx
import React from 'react';
import { Lock, ShieldCheck, ShieldAlert, Calendar, Key, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { format } from 'date-fns';

const GRADE_COLORS: Record<string, string> = {
  'A+': '#10b981', 'A': '#22c55e', 'B': '#84cc16',
  'C': '#f59e0b', 'D': '#f97316', 'E': '#ef4444', 'F': '#dc2626', 'N/A': '#6b7280',
};

const VULN_CHECKS = [
  { key: 'heartbleed', label: 'Heartbleed' },
  { key: 'poodle', label: 'POODLE' },
  { key: 'beast', label: 'BEAST' },
  { key: 'freak', label: 'FREAK' },
  { key: 'logjam', label: 'Logjam' },
  { key: 'drowned', label: 'DROWN' },
  { key: 'robot', label: 'ROBOT' },
  { key: 'ticketbleed', label: 'Ticketbleed' },
];

export function TLSPanel({ result }: { result: any }) {
  const tls = result.tls;

  if (!tls) {
    return (
      <div className="glass-card p-8 text-center">
        <Lock className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-muted-foreground">No TLS data available for this scan.</p>
      </div>
    );
  }

  const vulnCount = VULN_CHECKS.filter((v) => tls[v.key]).length;

  return (
    <div className="space-y-6">
      {/* Grade banner */}
      <div className="glass-card p-6 flex items-center gap-6">
        <div
          className="w-20 h-20 rounded-2xl flex items-center justify-center text-3xl font-extrabold text-white flex-shrink-0"
          style={{ backgroundColor: GRADE_COLORS[tls.grade] || '#6b7280' }}
        >
          {tls.grade}
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-foreground">{tls.protocol || 'TLS Configuration'}</h3>
          <p className="text-sm text-muted-foreground">
            {tls.certIssuer ? `Issued by ${tls.certIssuer}` : 'Certificate information unavailable'}
          </p>
          <div className="flex items-center gap-4 mt-2 text-xs">
            <span className={cn('flex items-center gap-1', vulnCount === 0 ? 'text-emerald-400' : 'text-red-400')}>
              {vulnCount === 0 ? <ShieldCheck size={12} /> : <ShieldAlert size={12} />}
              {vulnCount === 0 ? 'No known vulnerabilities' : `${vulnCount} vulnerabilities found`}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Certificate details */}
        <div className="glass-card p-5">
          <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wider">Certificate</p>
          <div className="space-y-2.5 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Subject</span><span className="font-mono text-foreground truncate max-w-[60%]">{tls.certSubject || '—'}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Issuer</span><span className="font-mono text-foreground truncate max-w-[60%]">{tls.certIssuer || '—'}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Key Strength</span><span className="font-mono text-foreground">{tls.certKeyStrength || '—'} bits</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Signature</span><span className="font-mono text-foreground">{tls.certSignatureAlgorithm || '—'}</span></div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground flex items-center gap-1"><Calendar size={12} /> Expires</span>
              <span className="font-mono text-foreground">
                {tls.certExpiry ? format(new Date(tls.certExpiry), 'MMM d, yyyy') : '—'}
              </span>
            </div>
            <div className="flex justify-between"><span className="text-muted-foreground">Cert Transparency</span>
              <span className={tls.certTransparency ? 'text-emerald-400' : 'text-red-400'}>
                {tls.certTransparency ? 'Yes' : 'No'}
              </span>
            </div>
          </div>
        </div>

        {/* HSTS */}
        <div className="glass-card p-5">
          <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wider">HSTS</p>
          <div className="space-y-2.5 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Enabled</span>
              <span className={tls.hsts ? 'text-emerald-400' : 'text-red-400'}>{tls.hsts ? 'Yes' : 'No'}</span>
            </div>
            <div className="flex justify-between"><span className="text-muted-foreground">Max Age</span><span className="font-mono text-foreground">{tls.hstsMaxAge ? `${Math.round(tls.hstsMaxAge / 86400)} days` : '—'}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Include Subdomains</span>
              <span className={tls.hstsIncludeSubdomains ? 'text-emerald-400' : 'text-muted-foreground'}>{tls.hstsIncludeSubdomains ? 'Yes' : 'No'}</span>
            </div>
            <div className="flex justify-between"><span className="text-muted-foreground">Preload</span>
              <span className={tls.hstsPreload ? 'text-emerald-400' : 'text-muted-foreground'}>{tls.hstsPreload ? 'Yes' : 'No'}</span>
            </div>
            <div className="flex justify-between"><span className="text-muted-foreground">Forward Secrecy</span><span className="font-mono text-foreground capitalize">{tls.forwardSecrecy || '—'}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">OCSP Stapling</span>
              <span className={tls.ocspStapling ? 'text-emerald-400' : 'text-muted-foreground'}>{tls.ocspStapling ? 'Yes' : 'No'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Vulnerability matrix */}
      <div className="glass-card p-5">
        <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wider">Vulnerability Scan</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {VULN_CHECKS.map((v) => (
            <div
              key={v.key}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border',
                tls[v.key]
                  ? 'bg-red-500/10 text-red-400 border-red-500/20'
                  : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
              )}
            >
              {tls[v.key] ? <AlertTriangle size={12} /> : <ShieldCheck size={12} />}
              {v.label}
            </div>
          ))}
        </div>
      </div>

      {/* Cipher suites */}
      {tls.cipherSuites?.length > 0 && (
        <div className="glass-card p-5">
          <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wider">Cipher Suites</p>
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {tls.cipherSuites.map((c: any, i: number) => (
              <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-muted/30 text-xs">
                <span className="font-mono text-foreground">{c.name}</span>
                <span
                  className={cn('px-2 py-0.5 rounded-full font-medium capitalize', {
                    'bg-emerald-500/10 text-emerald-400': c.strength === 'strong',
                    'bg-amber-500/10 text-amber-400': c.strength === 'acceptable',
                    'bg-red-500/10 text-red-400': c.strength === 'weak' || c.strength === 'insecure',
                  })}
                >
                  {c.strength}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
