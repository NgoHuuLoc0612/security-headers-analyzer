'use client';
// apps/web/src/components/dashboard/worker-architecture-diagram.tsx
import React from 'react';
import { motion } from 'framer-motion';
import { Network, Cpu, Globe2, ShieldCheck, RotateCcw, AlertOctagon, Layers, GitBranch } from 'lucide-react';

const FEATURES = [
  {
    icon: Layers,
    title: 'Worker Specialization',
    desc: 'IO workers handle network calls (HTTP/DNS), CPU workers run the rule engine & scoring, API workers manage rate-limited external calls (SSL Labs, VirusTotal, RDAP).',
    color: '#6366f1',
  },
  {
    icon: Network,
    title: 'Horizontal Scaling',
    desc: 'Cluster module forks N processes (1 per CPU core), each running independent NestJS instances sharing the same Redis-backed queues.',
    color: '#06b6d4',
  },
  {
    icon: GitBranch,
    title: 'Fan-out / Fan-in',
    desc: 'BullMQ FlowProducer creates parent-child job graphs: HTTP fetch fans out to DNS + SSL Labs + VirusTotal + RDAP in parallel, then fans back in at the Result Aggregator.',
    color: '#10b981',
  },
  {
    icon: AlertOctagon,
    title: 'Backpressure Control',
    desc: 'Queue depth thresholds (500 IO / 200 CPU / 300 API) reject new submissions before the system is overwhelmed, returning estimated wait times.',
    color: '#f59e0b',
  },
  {
    icon: RotateCcw,
    title: 'Retry + Dead Letter Queue',
    desc: 'Exponential backoff retries (3-4 attempts per worker type) before failed jobs are moved to dedicated DLQ queues for manual inspection and replay.',
    color: '#ef4444',
  },
  {
    icon: ShieldCheck,
    title: 'Idempotent Jobs',
    desc: 'Redis-backed idempotency keys (SET NX with 60s TTL) prevent duplicate analysis submissions for the same URL within a short window.',
    color: '#8b5cf6',
  },
];

export function WorkerArchitectureDiagram({ metrics }: { metrics: any }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {FEATURES.map((f, i) => (
        <motion.div
          key={f.title}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.08 }}
          className="glass-card p-5 space-y-3"
        >
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: `${f.color}20` }}
          >
            <f.icon size={18} style={{ color: f.color }} />
          </div>
          <h3 className="font-semibold text-sm text-foreground">{f.title}</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
        </motion.div>
      ))}

      {/* Concurrency config card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="glass-card p-5 md:col-span-2 lg:col-span-3"
      >
        <h3 className="font-semibold text-sm text-foreground mb-3 flex items-center gap-2">
          <Cpu size={16} /> Concurrency Configuration
        </h3>
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'IO Worker Concurrency', value: 20, desc: 'Network-bound, high parallelism' },
            { label: 'CPU Worker Concurrency', value: 4, desc: 'CPU-bound, matches core count' },
            { label: 'API Worker Concurrency', value: 8, desc: 'Rate-limited (10 req/s/worker)' },
          ].map((c) => (
            <div key={c.label} className="text-center p-3 rounded-lg bg-muted/30">
              <p className="text-2xl font-bold text-primary">{c.value}</p>
              <p className="text-xs font-medium text-foreground mt-1">{c.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{c.desc}</p>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
