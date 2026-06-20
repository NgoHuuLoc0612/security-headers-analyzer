'use client';
// apps/web/src/components/analysis/panels/headers-panel.tsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, CheckCircle2, XCircle, AlertCircle, Info } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'sev-critical',
  high: 'sev-high',
  medium: 'sev-medium',
  low: 'sev-low',
  info: 'sev-info',
};

const STATUS_ICON: Record<string, React.ElementType> = {
  present: CheckCircle2,
  missing: XCircle,
  misconfigured: AlertCircle,
  deprecated: Info,
};

const STATUS_COLOR: Record<string, string> = {
  present: 'text-emerald-400',
  missing: 'text-red-400',
  misconfigured: 'text-amber-400',
  deprecated: 'text-gray-400',
};

export function HeadersPanel({ result }: { result: any }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const headers = result.headers || [];

  const sorted = [...headers].sort((a, b) => {
    const order = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    return (order as any)[a.severity] - (order as any)[b.severity];
  });

  return (
    <div className="space-y-2">
      {sorted.map((header: any, i: number) => {
        const Icon = STATUS_ICON[header.status] || Info;
        const isOpen = expanded === header.name;

        return (
          <motion.div
            key={header.name}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
            className="glass-card overflow-hidden"
          >
            <button
              onClick={() => setExpanded(isOpen ? null : header.name)}
              className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Icon size={18} className={cn('flex-shrink-0', STATUS_COLOR[header.status])} />
                <div className="min-w-0">
                  <p className="font-mono text-sm font-medium text-foreground truncate">{header.name}</p>
                  <p className="text-xs text-muted-foreground truncate max-w-md">
                    {header.value || 'Not set'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 flex-shrink-0">
                <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', SEVERITY_STYLES[header.severity])}>
                  {header.severity}
                </span>
                <span className="text-sm font-mono text-muted-foreground w-16 text-right">
                  {header.score}/{header.maxScore}
                </span>
                <ChevronDown
                  size={16}
                  className={cn('text-muted-foreground transition-transform', isOpen && 'rotate-180')}
                />
              </div>
            </button>

            {isOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                className="px-4 pb-4 border-t border-border/50 pt-3 space-y-3"
              >
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Details</p>
                  <p className="text-sm text-foreground">{header.details}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Recommendation</p>
                  <p className="text-sm text-foreground bg-primary/5 border border-primary/10 rounded-lg p-3">
                    {header.recommendation}
                  </p>
                </div>
                {header.cweIds?.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">CWE:</span>
                    {header.cweIds.map((cwe: string) => (
                      <span key={cwe} className="text-xs font-mono px-1.5 py-0.5 rounded bg-muted text-foreground">
                        {cwe}
                      </span>
                    ))}
                  </div>
                )}
                {header.owaspCategory && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">OWASP:</span>
                    <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-muted text-foreground">
                      {header.owaspCategory}
                    </span>
                  </div>
                )}
              </motion.div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}
