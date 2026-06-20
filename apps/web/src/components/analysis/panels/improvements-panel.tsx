'use client';
// apps/web/src/components/analysis/panels/improvements-panel.tsx
import React from 'react';
import { motion } from 'framer-motion';
import { Sparkles, TrendingUp, Clock, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

const EFFORT_COLORS: Record<string, string> = {
  trivial: 'bg-emerald-500/10 text-emerald-400',
  low: 'bg-blue-500/10 text-blue-400',
  medium: 'bg-amber-500/10 text-amber-400',
  high: 'bg-red-500/10 text-red-400',
};

export function ImprovementsPanel({ result }: { result: any }) {
  const improvements = result.score?.improvements || [];

  if (improvements.length === 0) {
    return (
      <div className="glass-card p-8 text-center space-y-3">
        <Sparkles className="w-10 h-10 text-emerald-400 mx-auto" />
        <h3 className="font-semibold text-foreground">No improvements needed!</h3>
        <p className="text-sm text-muted-foreground">This site has excellent security header configuration.</p>
      </div>
    );
  }

  const totalGain = improvements.reduce((sum: number, imp: any) => sum + (imp.scoreGain || 0), 0);

  return (
    <div className="space-y-4">
      <div className="glass-card p-4 flex items-center justify-between bg-gradient-to-r from-primary/5 to-cyan-500/5">
        <div className="flex items-center gap-2">
          <TrendingUp size={18} className="text-primary" />
          <div>
            <p className="text-sm font-medium text-foreground">Potential improvement</p>
            <p className="text-xs text-muted-foreground">{improvements.length} actionable recommendations</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-emerald-400">+{totalGain.toFixed(0)}</p>
          <p className="text-xs text-muted-foreground">points available</p>
        </div>
      </div>

      <div className="space-y-2">
        {improvements.map((imp: any, i: number) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04 }}
            className="glass-card p-4"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center mt-0.5">
                  {imp.priority}
                </span>
                <div className="min-w-0">
                  <p className="font-mono text-sm font-medium text-foreground">{imp.header}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">{imp.action}</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">{imp.impact}</p>
                </div>
              </div>

              <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                <span className="text-sm font-bold text-emerald-400">+{imp.scoreGain?.toFixed(0)}</span>
                <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium capitalize', EFFORT_COLORS[imp.effort])}>
                  {imp.effort}
                </span>
              </div>
            </div>

            {imp.references?.length > 0 && (
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/50">
                {imp.references.map((ref: string, j: number) => (
                  <a
                    key={j}
                    href={ref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <ExternalLink size={10} /> Reference
                  </a>
                ))}
              </div>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
