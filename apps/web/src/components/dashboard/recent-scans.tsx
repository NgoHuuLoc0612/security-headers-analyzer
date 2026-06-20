'use client';
// apps/web/src/components/dashboard/recent-scans.tsx
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Clock, ExternalLink } from 'lucide-react';
import { api } from '@/lib/api/client';
import { cn } from '@/lib/utils/cn';
import { formatDistanceToNow } from 'date-fns';

const GRADE_BG: Record<string, string> = {
  'A+': 'grade-aplus', 'A': 'grade-a', 'B': 'grade-b',
  'C': 'grade-c', 'D': 'grade-d', 'E': 'grade-e', 'F': 'grade-f',
};

export function RecentScans() {
  const [scans, setScans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchScans = () => {
      api.listAnalyses({ limit: 8, sortBy: 'analyzedAt', sortOrder: 'desc' })
        .then((res) => setScans(res?.data?.data || res?.data || []))
        .catch(() => {})
        .finally(() => setLoading(false));
    };
    fetchScans();
    const iv = setInterval(fetchScans, 10000);
    return () => clearInterval(iv);
  }, []);

  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Clock size={16} className="text-cyan-400" />
          <h3 className="font-semibold text-sm text-foreground">Recent Scans</h3>
        </div>
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-cyan-400" />
        </span>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-10 bg-muted/50 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : scans.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          No scans yet. Be the first to analyze a site!
        </p>
      ) : (
        <div className="space-y-1.5">
          {scans.map((scan, i) => (
            <Link key={scan.id} href={`/analyze/${scan.id}`}>
              <motion.div
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                className="flex items-center justify-between p-2.5 rounded-lg hover:bg-muted/50 transition-colors group cursor-pointer"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground truncate font-mono group-hover:text-primary transition-colors">
                    {scan.domain}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {scan.analyzedAt
                      ? formatDistanceToNow(new Date(scan.analyzedAt), { addSuffix: true })
                      : '—'}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                  <span className="text-xs text-muted-foreground">
                    {scan.overallScore ? `${Math.round(scan.overallScore)}%` : '—'}
                  </span>
                  <span
                    className={cn(
                      'grade-badge w-7 h-7 text-xs',
                      GRADE_BG[scan.grade] || 'bg-gray-500',
                    )}
                  >
                    {scan.grade || '?'}
                  </span>
                </div>
              </motion.div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
