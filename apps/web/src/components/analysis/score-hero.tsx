'use client';
// apps/web/src/components/analysis/score-hero.tsx
import React, { useRef, useEffect } from 'react';
import * as d3 from 'd3';
import { motion } from 'framer-motion';
import { Globe, Clock, Server, Shield, AlertTriangle, Download } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { api } from '@/lib/api/client';

const GRADE_COLORS: Record<string, string> = {
  'A+': '#10b981', 'A': '#22c55e', 'B': '#84cc16',
  'C': '#f59e0b', 'D': '#f97316', 'E': '#ef4444', 'F': '#dc2626',
};

function ScoreGauge({ score, grade }: { score: number; grade: string }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;
    const size = 180;
    const radius = size / 2 - 12;
    const color = GRADE_COLORS[grade] || '#6b7280';

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    svg.attr('viewBox', `0 0 ${size} ${size}`);

    const g = svg.append('g').attr('transform', `translate(${size / 2}, ${size / 2})`);

    // Background arc
    const bgArc = d3.arc()
      .innerRadius(radius - 10)
      .outerRadius(radius)
      .startAngle(-Math.PI * 0.75)
      .endAngle(Math.PI * 0.75);

    g.append('path')
      .attr('d', bgArc as any)
      .attr('fill', 'currentColor')
      .attr('class', 'text-muted opacity-20');

    // Score arc
    const scoreAngle = -Math.PI * 0.75 + (Math.PI * 1.5 * score) / 100;
    const scoreArc = d3.arc()
      .innerRadius(radius - 10)
      .outerRadius(radius)
      .startAngle(-Math.PI * 0.75)
      .endAngle(scoreAngle);

    const path = g.append('path')
      .attr('fill', color)
      .attr('class', 'score-ring')
      .style('color', color);

    const interpolate = d3.interpolate(-Math.PI * 0.75, scoreAngle);
    path.transition()
      .duration(1200)
      .ease(d3.easeCubicOut)
      .attrTween('d', () => (t: number) => {
        const a = d3.arc()
          .innerRadius(radius - 10)
          .outerRadius(radius)
          .startAngle(-Math.PI * 0.75)
          .endAngle(interpolate(t));
        return a({} as any) as string;
      });

    // Tick marks
    for (let i = 0; i <= 10; i++) {
      const angle = -Math.PI * 0.75 + (Math.PI * 1.5 * i) / 10;
      const x1 = Math.cos(angle) * (radius + 4);
      const y1 = Math.sin(angle) * (radius + 4);
      const x2 = Math.cos(angle) * (radius + 8);
      const y2 = Math.sin(angle) * (radius + 8);
      g.append('line')
        .attr('x1', x1).attr('y1', y1)
        .attr('x2', x2).attr('y2', y2)
        .attr('stroke', 'currentColor')
        .attr('class', 'text-muted-foreground opacity-30')
        .attr('stroke-width', 1);
    }
  }, [score, grade]);

  return (
    <div className="relative w-[180px] h-[180px]">
      <svg ref={svgRef} className="w-full h-full" />
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="text-5xl font-extrabold"
          style={{ color: GRADE_COLORS[grade] || '#6b7280' }}
        >
          {grade}
        </span>
        <span className="text-xs text-muted-foreground mt-1">{score.toFixed(1)}%</span>
      </div>
    </div>
  );
}

export function ScoreHero({ result }: { result: any }) {
  const score = result.score?.overall || 0;
  const grade = result.score?.grade || 'F';
  const risk = result.score?.riskProfile?.overallRisk || 'medium';

  const riskColors: Record<string, string> = {
    critical: 'text-red-400 bg-red-500/10 border-red-500/20',
    high: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
    medium: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
    low: 'text-green-400 bg-green-500/10 border-green-500/20',
  };

  return (
    <div className="glass-card p-6 md:p-8">
      <div className="flex flex-col md:flex-row items-center gap-8">
        {/* Gauge */}
        <ScoreGauge score={score} grade={grade} />

        {/* Info */}
        <div className="flex-1 w-full space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                <Globe size={14} />
                <span className="font-mono">{result.domain}</span>
              </div>
              <h1 className="text-2xl font-bold text-foreground truncate max-w-md">{result.url}</h1>
            </div>

            <div className="flex gap-2">
              <a
                href={api.exportAnalysis(result.id, 'json')}
                download
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted hover:bg-muted/80 text-xs font-medium text-foreground transition-colors"
              >
                <Download size={12} /> JSON
              </a>
              <a
                href={api.exportAnalysis(result.id, 'csv')}
                download
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted hover:bg-muted/80 text-xs font-medium text-foreground transition-colors"
              >
                <Download size={12} /> CSV
              </a>
            </div>
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50">
              <Clock size={14} className="text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Duration</p>
                <p className="text-sm font-semibold text-foreground">{result.duration || 0}ms</p>
              </div>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50">
              <Server size={14} className="text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <p className="text-sm font-semibold text-foreground">{result.http?.statusCode || '—'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50">
              <Shield size={14} className="text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">TLS Grade</p>
                <p className="text-sm font-semibold text-foreground">{result.tls?.grade || 'N/A'}</p>
              </div>
            </div>
            <div className={cn('flex items-center gap-2 px-3 py-2 rounded-lg border', riskColors[risk])}>
              <AlertTriangle size={14} />
              <div>
                <p className="text-xs opacity-70">Risk Level</p>
                <p className="text-sm font-semibold capitalize">{risk}</p>
              </div>
            </div>
          </div>

          {/* Category mini-bars */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 pt-2">
            {Object.entries(result.score?.categories || {}).map(([key, cat]: [string, any]) => (
              <div key={key} className="space-y-1">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide truncate">{cat.label}</p>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(cat.score / (cat.maxScore || 100)) * 100}%` }}
                    transition={{ duration: 0.8, delay: 0.2 }}
                    className="h-full rounded-full"
                    style={{ backgroundColor: cat.color || '#6366f1' }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
