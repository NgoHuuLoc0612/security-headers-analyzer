'use client';
// apps/web/src/components/dashboard/trend-chart.tsx
import React, { useRef, useEffect, useState } from 'react';
import * as d3 from 'd3';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export function TrendChart({ trend }: { trend: any }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);

  const points = trend?.dataPoints || [];

  useEffect(() => {
    if (!svgRef.current || points.length === 0) return;

    const width = 800;
    const height = 240;
    const margin = { top: 20, right: 20, bottom: 30, left: 40 };

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    svg.attr('viewBox', `0 0 ${width} ${height}`);

    const data = points.map((p: any) => ({ ...p, date: new Date(p.timestamp) }));

    const x = d3.scaleTime()
      .domain(d3.extent(data, (d: any) => d.date) as [Date, Date])
      .range([margin.left, width - margin.right]);

    const y = d3.scaleLinear()
      .domain([0, 100])
      .range([height - margin.bottom, margin.top]);

    // Grid
    svg.append('g')
      .attr('class', 'd3-grid')
      .selectAll('line')
      .data(y.ticks(5))
      .join('line')
      .attr('x1', margin.left).attr('x2', width - margin.right)
      .attr('y1', (d) => y(d)).attr('y2', (d) => y(d));

    // Axes
    svg.append('g')
      .attr('class', 'd3-axis')
      .attr('transform', `translate(0, ${height - margin.bottom})`)
      .call(d3.axisBottom(x).ticks(6).tickSizeOuter(0));

    svg.append('g')
      .attr('class', 'd3-axis')
      .attr('transform', `translate(${margin.left}, 0)`)
      .call(d3.axisLeft(y).ticks(5).tickSizeOuter(0));

    // Gradient fill
    const gradient = svg.append('defs').append('linearGradient')
      .attr('id', 'trendGradient')
      .attr('x1', '0').attr('y1', '0').attr('x2', '0').attr('y2', '1');
    gradient.append('stop').attr('offset', '0%').attr('stop-color', '#10b981').attr('stop-opacity', 0.3);
    gradient.append('stop').attr('offset', '100%').attr('stop-color', '#10b981').attr('stop-opacity', 0);

    const area = d3.area<any>()
      .x((d) => x(d.date))
      .y0(height - margin.bottom)
      .y1((d) => y(d.score))
      .curve(d3.curveMonotoneX);

    svg.append('path')
      .datum(data)
      .attr('fill', 'url(#trendGradient)')
      .attr('d', area);

    const line = d3.line<any>()
      .x((d) => x(d.date))
      .y((d) => y(d.score))
      .curve(d3.curveMonotoneX);

    const path = svg.append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', '#10b981')
      .attr('stroke-width', 2)
      .attr('d', line);

    const totalLength = (path.node() as SVGPathElement).getTotalLength();
    path
      .attr('stroke-dasharray', `${totalLength} ${totalLength}`)
      .attr('stroke-dashoffset', totalLength)
      .transition()
      .duration(1200)
      .ease(d3.easeCubicOut)
      .attr('stroke-dashoffset', 0);

    // Points
    svg.selectAll('circle')
      .data(data)
      .join('circle')
      .attr('cx', (d: any) => x(d.date))
      .attr('cy', (d: any) => y(d.score))
      .attr('r', 4)
      .attr('fill', '#10b981')
      .attr('stroke', 'white')
      .attr('stroke-width', 1.5)
      .style('cursor', 'pointer')
      .on('mouseenter', function (event, d: any) {
        const rect = containerRef.current?.getBoundingClientRect();
        setTooltip({
          x: event.clientX - (rect?.left || 0),
          y: event.clientY - (rect?.top || 0),
          text: `${d.grade} · ${d.score.toFixed(1)}% · ${d.date.toLocaleDateString()}`,
        });
      })
      .on('mouseleave', () => setTooltip(null));

  }, [points]);

  const TrendIcon = trend?.trend === 'improving' ? TrendingUp : trend?.trend === 'degrading' ? TrendingDown : Minus;
  const trendColor = trend?.trend === 'improving' ? 'text-emerald-400' : trend?.trend === 'degrading' ? 'text-red-400' : 'text-muted-foreground';

  return (
    <div ref={containerRef} className="glass-card p-5 relative">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-sm text-foreground">{trend?.domain} — Score Trend</h3>
          <p className="text-xs text-muted-foreground">{trend?.totalScans} scans over time</p>
        </div>
        <div className={cn('flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium', `${trendColor} bg-current/10`)}>
          <TrendIcon size={12} className={trendColor} />
          <span className={trendColor}>{trend?.changePercent > 0 ? '+' : ''}{trend?.changePercent}%</span>
        </div>
      </div>
      <svg ref={svgRef} className="w-full h-auto" />
      {tooltip && (
        <div className="d3-tooltip" style={{ left: tooltip.x, top: tooltip.y - 40 }}>
          {tooltip.text}
        </div>
      )}
    </div>
  );
}
