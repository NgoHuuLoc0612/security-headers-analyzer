'use client';
// apps/web/src/app/dashboard/page.tsx
import React from 'react';
import { motion } from 'framer-motion';
import { SHAHeader } from '@/components/layout/sha-header';
import { StatsOverview } from '@/components/dashboard/stats-overview';
import { LeaderboardCard } from '@/components/dashboard/leaderboard-card';
import { RecentScans } from '@/components/dashboard/recent-scans';
import { QueueMetricsGrid } from '@/components/dashboard/queue-metrics-grid';
import { GlobalScoreHeatmap } from '@/components/dashboard/global-score-heatmap';
import { useState, useEffect } from 'react';
import { api } from '@/lib/api/client';

export default function DashboardPage() {
  const [queueMetrics, setQueueMetrics] = useState<any>(null);

  useEffect(() => {
    const fetchMetrics = () => api.getQueueMetrics().then((r) => setQueueMetrics(r?.data || r)).catch(() => {});
    fetchMetrics();
    const iv = setInterval(fetchMetrics, 5000);
    return () => clearInterval(iv);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <div className="fixed inset-0 bg-grid-dark bg-[size:40px_40px] pointer-events-none" />
      <SHAHeader />

      <main className="relative z-10 pt-24 pb-16 px-4">
        <div className="max-w-6xl mx-auto space-y-10">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="text-3xl font-extrabold text-gradient mb-2">Analytics Dashboard</h1>
            <p className="text-muted-foreground">Global security posture across all scanned domains</p>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
            <StatsOverview />
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <h2 className="text-lg font-semibold text-foreground mb-4">Worker Queue Health</h2>
            <QueueMetricsGrid metrics={queueMetrics} />
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
            <GlobalScoreHeatmap />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="grid grid-cols-1 lg:grid-cols-2 gap-6"
          >
            <LeaderboardCard />
            <RecentScans />
          </motion.div>
        </div>
      </main>
    </div>
  );
}
