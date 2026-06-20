'use client';
// apps/web/src/components/analysis/panels/compliance-panel.tsx
import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, XCircle, FileText } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

const FRAMEWORKS = [
  { key: 'pciDss', label: 'PCI DSS', desc: 'Payment Card Industry Data Security Standard' },
  { key: 'gdpr', label: 'GDPR', desc: 'General Data Protection Regulation' },
  { key: 'hipaa', label: 'HIPAA', desc: 'Health Insurance Portability and Accountability Act' },
  { key: 'owasp', label: 'OWASP', desc: 'OWASP Secure Headers Project' },
  { key: 'nist', label: 'NIST', desc: 'NIST SP 800-44 Guidelines' },
  { key: 'cis', label: 'CIS', desc: 'CIS Benchmark for Web Servers' },
];

export function CompliancePanel({ result }: { result: any }) {
  const compliance = result.score?.complianceStatus || {};

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {FRAMEWORKS.map((fw, i) => {
        const data = compliance[fw.key] || { compliant: false, score: 0, issues: [], recommendations: [] };
        return (
          <motion.div
            key={fw.key}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="glass-card p-5"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-muted-foreground" />
                <div>
                  <h4 className="font-semibold text-sm text-foreground">{fw.label}</h4>
                  <p className="text-xs text-muted-foreground">{fw.desc}</p>
                </div>
              </div>
              <div
                className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium flex-shrink-0',
                  data.compliant
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : 'bg-red-500/10 text-red-400',
                )}
              >
                {data.compliant ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                {data.compliant ? 'Compliant' : 'Non-compliant'}
              </div>
            </div>

            <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-3">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${data.score}%` }}
                transition={{ delay: 0.2, duration: 0.6 }}
                className={cn('h-full rounded-full', data.compliant ? 'bg-emerald-500' : 'bg-red-500')}
              />
            </div>

            {data.issues?.length > 0 && (
              <div className="space-y-1">
                {data.issues.map((issue: string, j: number) => (
                  <p key={j} className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <span className="text-red-400 mt-0.5">•</span> {issue}
                  </p>
                ))}
              </div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}
