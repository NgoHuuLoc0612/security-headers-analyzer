'use client';
// apps/web/src/components/analysis/analysis-pipeline-progress.tsx
import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Circle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface Stage {
  id: string;
  label: string;
  icon: string;
}

interface Props {
  stages: Stage[];
  currentStage: string;
  currentStageIndex: number;
  progress: number;
  url: string;
  correlationId?: string;
}

export function AnalysisPipelineProgress({
  stages,
  currentStage,
  currentStageIndex,
  progress,
  url,
  correlationId,
}: Props) {
  return (
    <div className="glass-card p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">Analyzing security headers</p>
          <p className="text-xs text-muted-foreground font-mono mt-0.5 truncate max-w-xs">{url}</p>
        </div>
        {correlationId && (
          <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-1 rounded">
            {correlationId.substring(0, 8)}
          </span>
        )}
      </div>

      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{currentStage || 'Initializing...'}</span>
          <span>{progress}%</span>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-indigo-500 to-cyan-500 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        </div>
      </div>

      {/* Stage indicators */}
      <div className="relative">
        {/* Connecting line */}
        <div className="absolute top-3.5 left-3.5 right-3.5 h-px bg-border" />

        <div className="relative flex justify-between">
          {stages.slice(0, 8).map((stage, i) => {
            const isDone = i < currentStageIndex;
            const isActive = i === currentStageIndex;
            const isPending = i > currentStageIndex;

            return (
              <div key={stage.id} className="flex flex-col items-center gap-1.5 z-10">
                <div
                  className={cn(
                    'w-7 h-7 rounded-full flex items-center justify-center text-xs transition-all duration-300',
                    isDone && 'bg-green-500 text-white shadow-glow-green',
                    isActive && 'bg-primary text-white shadow-lg ring-2 ring-primary/30 animate-pulse-slow',
                    isPending && 'bg-muted text-muted-foreground',
                  )}
                >
                  {isDone ? (
                    <CheckCircle2 size={14} />
                  ) : isActive ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <span>{stage.icon}</span>
                  )}
                </div>
                <span
                  className={cn(
                    'text-[9px] font-medium text-center leading-tight max-w-[50px]',
                    isActive ? 'text-primary' : isDone ? 'text-green-500' : 'text-muted-foreground',
                  )}
                >
                  {stage.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Live log */}
      <div className="terminal text-[11px] h-20 overflow-y-auto no-scrollbar">
        {stages.slice(0, currentStageIndex + 1).map((s, i) => (
          <div key={s.id} className={cn(i === currentStageIndex ? 'text-green-400' : 'text-green-400/50')}>
            {i === currentStageIndex ? '→' : '✓'} [{new Date().toLocaleTimeString('en', { hour12: false })}] {s.label}
            {i === currentStageIndex && (
              <span className="animate-pulse">_</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
