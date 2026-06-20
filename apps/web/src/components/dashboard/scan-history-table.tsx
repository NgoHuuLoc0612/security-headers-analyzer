'use client';
// apps/web/src/components/dashboard/scan-history-table.tsx
import React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils/cn';
import { formatDistanceToNow } from 'date-fns';
import { ArrowUpRight } from 'lucide-react';

const GRADE_BG: Record<string, string> = {
  'A+': 'grade-aplus', 'A': 'grade-a', 'B': 'grade-b',
  'C': 'grade-c', 'D': 'grade-d', 'E': 'grade-e', 'F': 'grade-f',
};

export function ScanHistoryTable({ analyses, loading }: { analyses: any[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="glass-card p-4 space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-12 bg-muted/30 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (analyses.length === 0) {
    return (
      <div className="glass-card p-12 text-center">
        <p className="text-muted-foreground">No scan history found</p>
      </div>
    );
  }

  return (
    <div className="glass-card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Domain</th>
            <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Grade</th>
            <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Score</th>
            <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase hidden sm:table-cell">TLS</th>
            <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase hidden md:table-cell">HSTS</th>
            <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Scanned</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {analyses.map((a) => (
            <tr key={a.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
              <td className="px-4 py-3 font-mono text-foreground">{a.domain || a.url}</td>
              <td className="px-4 py-3">
                <span className={cn('grade-badge w-7 h-7 text-xs', GRADE_BG[a.grade] || 'bg-gray-500')}>
                  {a.grade || '?'}
                </span>
              </td>
              <td className="px-4 py-3 text-foreground">{a.overallScore ? `${Math.round(a.overallScore)}%` : '—'}</td>
              <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{a.tlsGrade || '—'}</td>
              <td className="px-4 py-3 hidden md:table-cell">
                <span className={a.hstsEnabled ? 'text-emerald-400' : 'text-red-400'}>
                  {a.hstsEnabled ? 'Yes' : 'No'}
                </span>
              </td>
              <td className="px-4 py-3 text-muted-foreground text-xs">
                {a.analyzedAt ? formatDistanceToNow(new Date(a.analyzedAt), { addSuffix: true }) : '—'}
              </td>
              <td className="px-4 py-3">
                <Link href={`/analyze/${a.id}`} className="text-primary hover:text-primary/80">
                  <ArrowUpRight size={14} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
