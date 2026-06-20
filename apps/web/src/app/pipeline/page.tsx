'use client';
// apps/web/src/app/pipeline/page.tsx
import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { SHAHeader } from '@/components/layout/sha-header';
import { RealtimePipeline } from '@/components/dashboard/realtime-pipeline';
import { QueueMetricsGrid } from '@/components/dashboard/queue-metrics-grid';
import { WorkerArchitectureDiagram } from '@/components/dashboard/worker-architecture-diagram';
import { api } from '@/lib/api/client';

export default function PipelinePage() {
  const [metrics, setMetrics] = useState<any>(null);

  useEffect(() => {
    const fetchMetrics = () => api.getQueueMetrics().then((r) => setMetrics(r?.data || r)).catch(() => {});
    fetchMetrics();
    const iv = setInterval(fetchMetrics, 3000);
    return () => clearInterval(iv);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <div className="fixed inset-0 bg-grid-dark bg-[size:40px_40px] pointer-events-none" />
      <SHAHeader />

      <main className="relative z-10 pt-24 pb-16 px-4">
        <div className="max-w-6xl mx-auto space-y-10">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="text-center mb-8">
              <h1 className="text-4xl font-extrabold text-gradient mb-2">Multi-Worker Pipeline</h1>
              <p className="text-muted-foreground">
                Queue-based architecture with specialized IO/CPU/API workers, fan-out/fan-in,
                backpressure control, and dead letter queues.
              </p>
            </div>
            <RealtimePipeline />
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <h2 className="text-lg font-semibold text-foreground mb-4">Queue Metrics</h2>
            <QueueMetricsGrid metrics={metrics} />
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <h2 className="text-lg font-semibold text-foreground mb-4">Worker Specialization</h2>
            <WorkerArchitectureDiagram metrics={metrics} />
          </motion.div>
        </div>
      </main>
    </div>
  );
}
