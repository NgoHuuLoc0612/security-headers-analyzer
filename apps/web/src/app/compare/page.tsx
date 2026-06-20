'use client';
// apps/web/src/app/compare/page.tsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { SHAHeader } from '@/components/layout/sha-header';
import { ComparisonChart } from '@/components/dashboard/comparison-chart';
import { Plus, X, GitCompare } from 'lucide-react';
import { api } from '@/lib/api/client';
import toast from 'react-hot-toast';

export default function ComparePage() {
  const [urls, setUrls] = useState<string[]>(['', '']);
  const [loading, setLoading] = useState(false);
  const [comparison, setComparison] = useState<any>(null);

  const addUrl = () => urls.length < 5 && setUrls([...urls, '']);
  const removeUrl = (i: number) => setUrls(urls.filter((_, idx) => idx !== i));
  const updateUrl = (i: number, val: string) => {
    const next = [...urls];
    next[i] = val;
    setUrls(next);
  };

  const handleCompare = async () => {
    const validUrls = urls.filter((u) => u.trim());
    if (validUrls.length < 2) {
      toast.error('Enter at least 2 URLs to compare');
      return;
    }

    setLoading(true);
    try {
      // Submit all for analysis, then poll for completion via correlation
      const results = await api.submitBulkAnalysis(
        validUrls.map((u) => (u.startsWith('http') ? u : `https://${u}`)),
      );

      toast.success(`${results.queued} analyses queued. This may take a minute...`);

      // Poll for results
      const correlationIds = results.jobs
        .filter((j: any) => j.status === 'queued')
        .map((j: any) => j.correlationId);

      const pollResults = async () => {
        const statuses = await Promise.all(
          correlationIds.map((id: string) => api.getByCorrelationId(id)),
        );

        const allDone = statuses.every((s) => s.status === 'completed');

        if (allDone) {
          const ids = statuses.map((s) => s.result?.id).filter(Boolean);
          const comp = await api.compareAnalyses(ids);
          setComparison(comp?.data || comp);
          setLoading(false);
        } else {
          setTimeout(pollResults, 3000);
        }
      };

      setTimeout(pollResults, 5000);
    } catch (err: any) {
      toast.error(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="fixed inset-0 bg-grid-dark bg-[size:40px_40px] pointer-events-none" />
      <SHAHeader />

      <main className="relative z-10 pt-24 pb-16 px-4">
        <div className="max-w-5xl mx-auto space-y-8">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="text-3xl font-extrabold text-gradient mb-2 flex items-center gap-2">
              <GitCompare /> Compare Sites
            </h1>
            <p className="text-muted-foreground mb-6">Compare security posture across multiple domains</p>

            <div className="glass-card p-5 space-y-3">
              {urls.map((url, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-6">{i + 1}.</span>
                  <input
                    value={url}
                    onChange={(e) => updateUrl(i, e.target.value)}
                    placeholder="https://example.com"
                    className="flex-1 bg-muted/50 rounded-lg px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  {urls.length > 2 && (
                    <button onClick={() => removeUrl(i)} className="text-muted-foreground hover:text-red-400">
                      <X size={16} />
                    </button>
                  )}
                </div>
              ))}

              <div className="flex items-center gap-2 pt-2">
                {urls.length < 5 && (
                  <button
                    onClick={addUrl}
                    className="flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    <Plus size={14} /> Add site
                  </button>
                )}
                <div className="flex-1" />
                <button
                  onClick={handleCompare}
                  disabled={loading}
                  className="px-5 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium disabled:opacity-50"
                >
                  {loading ? 'Comparing...' : 'Compare'}
                </button>
              </div>
            </div>
          </motion.div>

          {comparison && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
              <ComparisonChart comparison={comparison} />
            </motion.div>
          )}
        </div>
      </main>
    </div>
  );
}
