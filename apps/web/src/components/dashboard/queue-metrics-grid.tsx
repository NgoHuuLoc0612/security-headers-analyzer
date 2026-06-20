'use client';
// apps/web/src/components/dashboard/queue-metrics-grid.tsx
import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils/cn';

const QUEUE_INFO: Record<string, { label: string; color: string; desc: string }> = {
  orch: { label: 'Orchestrator', color: '#8b5cf6', desc: 'Job orchestration & fan-out' },
  io: { label: 'IO Workers', color: '#f59e0b', desc: 'Network I/O — HTTP, DNS' },
  cpu: { label: 'CPU Workers', color: '#10b981', desc: 'Rule engine, scoring' },
  api: { label: 'API Workers', color: '#3b82f6', desc: 'SSL Labs, VirusTotal, RDAP' },
};

export function QueueMetricsGrid({ metrics }: { metrics: any }) {
  if (!metrics) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-40 glass-card animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {Object.entries(QUEUE_INFO).map(([key, info], i) => {
        const data = metrics[key] || { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 };
        const total = data.waiting + data.active + data.completed + data.failed || 1;

        return (
          <motion.div
            key={key}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="glass-card p-4 space-y-3"
          >
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: info.color }} />
              <div>
                <p className="text-sm font-semibold text-foreground">{info.label}</p>
                <p className="text-xs text-muted-foreground">{info.desc}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="bg-muted/30 rounded-lg p-2">
                <p className="text-lg font-bold text-foreground">{data.waiting}</p>
                <p className="text-xs text-muted-foreground">Waiting</p>
              </div>
              <div className="bg-muted/30 rounded-lg p-2">
                <p className="text-lg font-bold text-amber-400">{data.active}</p>
                <p className="text-xs text-muted-foreground">Active</p>
              </div>
              <div className="bg-muted/30 rounded-lg p-2">
                <p className="text-lg font-bold text-emerald-400">{data.completed}</p>
                <p className="text-xs text-muted-foreground">Completed</p>
              </div>
              <div className="bg-muted/30 rounded-lg p-2">
                <p className="text-lg font-bold text-red-400">{data.failed}</p>
                <p className="text-xs text-muted-foreground">Failed</p>
              </div>
            </div>

            {/* Distribution bar */}
            <div className="h-1.5 rounded-full overflow-hidden flex bg-muted">
              <div className="h-full bg-amber-400" style={{ width: `${(data.active / total) * 100}%` }} />
              <div className="h-full bg-emerald-400" style={{ width: `${(data.completed / total) * 100}%` }} />
              <div className="h-full bg-red-400" style={{ width: `${(data.failed / total) * 100}%` }} />
            </div>

            {data.paused && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400">Paused</span>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}
