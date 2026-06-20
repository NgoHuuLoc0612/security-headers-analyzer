'use client';
// apps/web/src/app/history/page.tsx
import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { SHAHeader } from '@/components/layout/sha-header';
import { ScanHistoryTable } from '@/components/dashboard/scan-history-table';
import { TrendChart } from '@/components/dashboard/trend-chart';
import { api } from '@/lib/api/client';
import { Search } from 'lucide-react';

export default function HistoryPage() {
  const [domain, setDomain] = useState('');
  const [searchedDomain, setSearchedDomain] = useState('');
  const [analyses, setAnalyses] = useState<any[]>([]);
  const [trend, setTrend] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.listAnalyses({ limit: 50, sortBy: 'analyzedAt', sortOrder: 'desc' })
      .then((res) => setAnalyses(res?.data?.data || res?.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!domain.trim()) return;
    setSearchedDomain(domain);
    setLoading(true);
    try {
      const [historyRes, trendRes] = await Promise.allSettled([
        api.getDomainHistory(domain, 50),
        api.getDomainTrend(domain, 90),
      ]);
      if (historyRes.status === 'fulfilled') {
        setAnalyses(historyRes.value?.data?.analyses || historyRes.value?.analyses || []);
      }
      if (trendRes.status === 'fulfilled') {
        setTrend(trendRes.value?.data || trendRes.value);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="fixed inset-0 bg-grid-dark bg-[size:40px_40px] pointer-events-none" />
      <SHAHeader />

      <main className="relative z-10 pt-24 pb-16 px-4">
        <div className="max-w-6xl mx-auto space-y-8">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="text-3xl font-extrabold text-gradient mb-2">Scan History</h1>
            <p className="text-muted-foreground mb-6">Track security posture changes over time</p>

            <form onSubmit={handleSearch} className="glass-card p-2 flex items-center gap-2 max-w-lg">
              <Search size={16} className="text-muted-foreground ml-2" />
              <input
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="Filter by domain..."
                className="flex-1 bg-transparent outline-none text-sm py-2 font-mono"
              />
              <button type="submit" className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium">
                Search
              </button>
            </form>
          </motion.div>

          {trend && searchedDomain && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
              <TrendChart trend={trend} />
            </motion.div>
          )}

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <ScanHistoryTable analyses={analyses} loading={loading} />
          </motion.div>
        </div>
      </main>
    </div>
  );
}
