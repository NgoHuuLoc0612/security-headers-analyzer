'use client';
// apps/web/src/components/analysis/panels/treemap-panel.tsx
import React, { useRef, useEffect, useState } from 'react';
import * as d3 from 'd3';

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#dc2626',
  high: '#f97316',
  medium: '#f59e0b',
  low: '#3b82f6',
  info: '#6b7280',
};

export function TreemapPanel({ result }: { result: any }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string; detail: string } | null>(null);

  const headers = result.headers || [];

  useEffect(() => {
    if (!svgRef.current || headers.length === 0) return;

    const width = 480;
    const height = 420;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    svg.attr('viewBox', `0 0 ${width} ${height}`);

    const root = d3.hierarchy({
      name: 'root',
      children: headers.map((h: any) => ({
        name: h.name,
        value: Math.max(h.maxScore, 1),
        score: h.score,
        maxScore: h.maxScore,
        status: h.status,
        severity: h.severity,
        recommendation: h.recommendation,
      })),
    } as any)
      .sum((d: any) => d.value)
      .sort((a, b) => (b.value || 0) - (a.value || 0));

    d3.treemap()
      .size([width, height])
      .padding(3)
      .round(true)(root as any);

    const g = svg.append('g');

    const nodes = g.selectAll('g')
      .data(root.leaves())
      .join('g')
      .attr('transform', (d: any) => `translate(${d.x0}, ${d.y0})`)
      .style('cursor', 'pointer');

    nodes.append('rect')
      .attr('width', (d: any) => Math.max(0, d.x1 - d.x0))
      .attr('height', (d: any) => Math.max(0, d.y1 - d.y0))
      .attr('rx', 6)
      .attr('fill', (d: any) => {
        const data = d.data;
        const pct = data.score / (data.maxScore || 1);
        if (data.status === 'missing') return SEVERITY_COLORS[data.severity] || '#6b7280';
        return pct > 0.8 ? '#10b981' : pct > 0.5 ? '#f59e0b' : '#ef4444';
      })
      .attr('fill-opacity', 0)
      .attr('stroke', 'rgba(255,255,255,0.1)')
      .attr('stroke-width', 1)
      .transition()
      .duration(600)
      .delay((_, i) => i * 50)
      .attr('fill-opacity', 0.85);

    nodes.on('mouseenter', function (event, d: any) {
      d3.select(this).select('rect').attr('fill-opacity', 1).attr('stroke', 'white').attr('stroke-width', 1.5);
      const rect = containerRef.current?.getBoundingClientRect();
      setTooltip({
        x: event.clientX - (rect?.left || 0),
        y: event.clientY - (rect?.top || 0),
        text: `${d.data.name} — ${d.data.status}`,
        detail: `Score: ${d.data.score}/${d.data.maxScore} · ${d.data.severity}`,
      });
    }).on('mouseleave', function () {
      d3.select(this).select('rect').attr('fill-opacity', 0.85).attr('stroke', 'rgba(255,255,255,0.1)').attr('stroke-width', 1);
      setTooltip(null);
    });

    nodes.each(function (d: any) {
      const w = d.x1 - d.x0;
      const h = d.y1 - d.y0;
      if (w < 40 || h < 24) return;

      const text = d3.select(this).append('text')
        .attr('x', 6)
        .attr('y', 16)
        .attr('fill', 'white')
        .attr('font-size', 10)
        .attr('font-weight', 600)
        .text(d.data.name.length > w / 6 ? d.data.name.substring(0, Math.floor(w / 6)) + '…' : d.data.name);

      if (h > 36) {
        d3.select(this).append('text')
          .attr('x', 6)
          .attr('y', 30)
          .attr('fill', 'rgba(255,255,255,0.8)')
          .attr('font-size', 9)
          .text(`${d.data.score}/${d.data.maxScore}`);
      }
    });

  }, [headers]);

  return (
    <div ref={containerRef} className="viz-container p-4 relative">
      <p className="text-xs font-mono text-muted-foreground mb-2 uppercase tracking-wider">
        ◆ Header Score Treemap
      </p>
      <svg ref={svgRef} className="w-full h-auto" />
      {tooltip && (
        <div className="d3-tooltip" style={{ left: tooltip.x, top: tooltip.y - 50 }}>
          <div className="font-semibold">{tooltip.text}</div>
          <div className="text-muted-foreground text-xs">{tooltip.detail}</div>
        </div>
      )}
      <div className="flex items-center gap-3 mt-3 flex-wrap">
        {Object.entries(SEVERITY_COLORS).map(([sev, color]) => (
          <div key={sev} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
            <span className="text-xs text-muted-foreground capitalize">{sev}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
