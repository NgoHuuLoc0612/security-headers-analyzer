'use client';
// apps/web/src/components/dashboard/global-score-heatmap.tsx
import React, { useRef, useEffect, useState } from 'react';
import * as d3 from 'd3';
import { api } from '@/lib/api/client';

export function GlobalScoreHeatmap() {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);
  const [analyses, setAnalyses] = useState<any[]>([]);

  useEffect(() => {
    api.listAnalyses({ limit: 100, sortBy: 'analyzedAt', sortOrder: 'desc' })
      .then((res) => setAnalyses(res?.data?.data || res?.data || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!svgRef.current) return;

    const width = 900;
    const cellSize = 14;
    const cellGap = 3;
    const cols = 30;
    const rows = Math.ceil(Math.max(analyses.length, 30) / cols);
    const height = rows * (cellSize + cellGap) + 40;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    svg.attr('viewBox', `0 0 ${width} ${height}`);

    svg.append('text')
      .attr('x', 0).attr('y', 16)
      .attr('fill', 'currentColor')
      .attr('class', 'text-muted-foreground')
      .attr('font-size', 11)
      .attr('font-family', 'monospace')
      .text('▶ RECENT SCAN SCORE MATRIX');

    const colorScale = d3.scaleLinear<string>()
      .domain([0, 50, 75, 90, 100])
      .range(['#dc2626', '#f59e0b', '#84cc16', '#22c55e', '#10b981'])
      .clamp(true);

    const g = svg.append('g').attr('transform', 'translate(0, 30)');

    const cells = analyses.length > 0 ? analyses : Array.from({ length: 30 }).map(() => ({ overallScore: null }));

    g.selectAll('rect')
      .data(cells)
      .join('rect')
      .attr('x', (_, i) => (i % cols) * (cellSize + cellGap))
      .attr('y', (_, i) => Math.floor(i / cols) * (cellSize + cellGap))
      .attr('width', cellSize)
      .attr('height', cellSize)
      .attr('rx', 3)
      .attr('fill', (d: any) => d.overallScore != null ? colorScale(d.overallScore) : 'rgba(255,255,255,0.05)')
      .attr('opacity', 0)
      .style('cursor', (d: any) => d.overallScore != null ? 'pointer' : 'default')
      .on('mouseenter', function (event, d: any) {
        if (d.overallScore == null) return;
        d3.select(this).attr('stroke', 'white').attr('stroke-width', 1.5);
        const rect = containerRef.current?.getBoundingClientRect();
        setTooltip({
          x: event.clientX - (rect?.left || 0),
          y: event.clientY - (rect?.top || 0),
          text: `${d.domain || d.url} — ${d.grade} (${Math.round(d.overallScore)}%)`,
        });
      })
      .on('mouseleave', function () {
        d3.select(this).attr('stroke', 'none');
        setTooltip(null);
      })
      .transition()
      .duration(400)
      .delay((_, i) => i * 6)
      .attr('opacity', 1);

  }, [analyses]);

  return (
    <div ref={containerRef} className="viz-container p-4 relative overflow-x-auto">
      <svg ref={svgRef} className="w-full h-auto min-w-[700px]" />
      {tooltip && (
        <div className="d3-tooltip" style={{ left: tooltip.x, top: tooltip.y - 30 }}>
          {tooltip.text}
        </div>
      )}
      <div className="flex items-center gap-2 mt-3">
        <span className="text-xs text-muted-foreground">Low</span>
        <div className="flex gap-0.5">
          {['#dc2626', '#f59e0b', '#84cc16', '#22c55e', '#10b981'].map((c) => (
            <div key={c} className="w-4 h-3 rounded-sm" style={{ backgroundColor: c }} />
          ))}
        </div>
        <span className="text-xs text-muted-foreground">High</span>
      </div>
    </div>
  );
}
