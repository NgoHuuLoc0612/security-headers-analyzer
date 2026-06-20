'use client';
// apps/web/src/components/dashboard/comparison-chart.tsx
import React, { useRef, useEffect } from 'react';
import * as d3 from 'd3';
import { Crown } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

const GRADE_BG: Record<string, string> = {
  'A+': 'grade-aplus', 'A': 'grade-a', 'B': 'grade-b',
  'C': 'grade-c', 'D': 'grade-d', 'E': 'grade-e', 'F': 'grade-f',
};

export function ComparisonChart({ comparison }: { comparison: any }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const sites = comparison?.sites || [];

  useEffect(() => {
    if (!svgRef.current || sites.length === 0) return;

    const categories = ['headers', 'tls', 'csp', 'cookies', 'dns', 'reputation'];
    const width = 800;
    const height = 320;
    const margin = { top: 20, right: 20, bottom: 60, left: 40 };

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    svg.attr('viewBox', `0 0 ${width} ${height}`);

    const x0 = d3.scaleBand().domain(categories).range([margin.left, width - margin.right]).padding(0.3);
    const x1 = d3.scaleBand().domain(sites.map((s: any) => s.url)).range([0, x0.bandwidth()]).padding(0.1);
    const y = d3.scaleLinear().domain([0, 100]).range([height - margin.bottom, margin.top]);

    const colorScale = d3.scaleOrdinal(d3.schemeTableau10).domain(sites.map((s: any) => s.url));

    // Grid
    svg.append('g').attr('class', 'd3-grid')
      .selectAll('line').data(y.ticks(5)).join('line')
      .attr('x1', margin.left).attr('x2', width - margin.right)
      .attr('y1', (d) => y(d)).attr('y2', (d) => y(d));

    // Axes
    svg.append('g').attr('class', 'd3-axis')
      .attr('transform', `translate(0, ${height - margin.bottom})`)
      .call(d3.axisBottom(x0).tickSizeOuter(0));

    svg.append('g').attr('class', 'd3-axis')
      .attr('transform', `translate(${margin.left}, 0)`)
      .call(d3.axisLeft(y).ticks(5));

    // Bars
    const catGroups = svg.append('g')
      .selectAll('g')
      .data(categories)
      .join('g')
      .attr('transform', (d) => `translate(${x0(d)}, 0)`);

    catGroups.selectAll('rect')
      .data((cat) => sites.map((s: any) => ({
        site: s.url,
        value: (s.score?.categories?.[cat]?.score / (s.score?.categories?.[cat]?.maxScore || 100)) * 100 || 0,
      })))
      .join('rect')
      .attr('x', (d: any) => x1(d.site) || 0)
      .attr('width', x1.bandwidth())
      .attr('y', height - margin.bottom)
      .attr('height', 0)
      .attr('fill', (d: any) => colorScale(d.site) as string)
      .attr('rx', 3)
      .transition()
      .duration(800)
      .delay((_, i) => i * 50)
      .attr('y', (d: any) => y(d.value))
      .attr('height', (d: any) => height - margin.bottom - y(d.value));

  }, [sites]);

  return (
    <div className="space-y-6">
      {/* Winner banner */}
      {comparison?.winner && (
        <div className="glass-card p-4 flex items-center gap-3 bg-gradient-to-r from-amber-500/10 to-transparent border-amber-500/20">
          <Crown className="text-amber-400" size={20} />
          <div>
            <p className="text-sm font-medium text-foreground">Overall winner</p>
            <p className="text-xs text-muted-foreground font-mono">{comparison.winner}</p>
          </div>
        </div>
      )}

      {/* Side-by-side cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {sites.map((site: any, i: number) => (
          <div key={site.url} className="glass-card p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-mono text-foreground truncate">{site.url}</p>
              <span className={cn('grade-badge w-8 h-8 text-sm', GRADE_BG[site.grade] || 'bg-gray-500')}>
                {site.grade}
              </span>
            </div>
            <p className="text-2xl font-bold text-foreground">{site.score?.overall?.toFixed(1)}%</p>
          </div>
        ))}
      </div>

      {/* Grouped bar chart */}
      <div className="viz-container p-4">
        <p className="text-xs font-mono text-muted-foreground mb-3 uppercase tracking-wider">
          ◆ Category Comparison
        </p>
        <svg ref={svgRef} className="w-full h-auto" />
        <div className="flex items-center gap-4 mt-3 flex-wrap">
          {sites.map((site: any, i: number) => (
            <div key={site.url} className="flex items-center gap-1.5">
              <div
                className="w-2.5 h-2.5 rounded-sm"
                style={{ backgroundColor: d3.schemeTableau10[i % 10] }}
              />
              <span className="text-xs text-muted-foreground font-mono">{site.url}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
