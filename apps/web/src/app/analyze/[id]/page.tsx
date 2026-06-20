'use client';
// apps/web/src/app/analyze/[id]/page.tsx
import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { api } from '@/lib/api/client';
import { SHAHeader } from '@/components/layout/sha-header';
import { ScoreHero } from '@/components/analysis/score-hero';
import { ResultTabs } from '@/components/analysis/result-tabs';
import { Loader2 } from 'lucide-react';

export default function AnalysisDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api.getAnalysis(id)
      .then((res) => setResult(res?.data || res))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Loading analysis...</p>
        </div>
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-lg font-medium text-foreground">Analysis not found</p>
          <p className="text-sm text-muted-foreground">{error || 'The requested analysis could not be located.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="fixed inset-0 bg-grid-dark bg-[size:40px_40px] opacity-100 pointer-events-none" />
      <SHAHeader />

      <main className="relative z-10 pt-24 pb-16 px-4">
        <div className="max-w-6xl mx-auto space-y-8">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <ScoreHero result={result} />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <ResultTabs result={result} />
          </motion.div>
        </div>
      </main>
    </div>
  );
}
