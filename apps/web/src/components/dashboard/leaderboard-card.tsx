'use client';
// apps/web/src/components/dashboard/leaderboard-card.tsx
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Trophy, Medal, ArrowUpRight } from 'lucide-react';
import { api } from '@/lib/api/client';
import { cn } from '@/lib/utils/cn';

const RANK_ICONS = ['🥇', '🥈', '🥉'];

const GRADE_BG: Record<string, string> = {
  'A+': 'grade-aplus', 'A': 'grade-a', 'B': 'grade-b',
  'C': 'grade-c', 'D': 'grade-d', 'E': 'grade-e', 'F': 'grade-f',
};

export function LeaderboardCard() {
  const [domains, setDomains] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getTopDomains(8)
      .then((res) => setDomains(res?.data?.domains || res?.domains || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Trophy size={16} className="text-amber-400" />
          <h3 className="font-semibold text-sm text-foreground">Top Secured Domains</h3>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-10 bg-muted/50 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : domains.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          No domains scanned yet. Analyze a URL to get started.
        </p>
      ) : (
        <div className="space-y-1.5">
          {domains.map((d, i) => (
            <motion.div
              key={d.domain}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04 }}
              className="flex items-center justify-between p-2.5 rounded-lg hover:bg-muted/50 transition-colors group"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-sm w-6 text-center flex-shrink-0">
                  {RANK_ICONS[i] || `${i + 1}`}
                </span>
                <span className="text-sm text-foreground truncate font-mono">{d.domain}</span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs text-muted-foreground">{d.scanCount}x</span>
                <span
                  className={cn(
                    'grade-badge w-7 h-7 text-xs',
                    GRADE_BG[d.bestGrade] || 'bg-gray-500',
                  )}
                >
                  {d.bestGrade}
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
