'use client';
// apps/web/src/components/analysis/panels/csp-panel.tsx
import React, { useRef, useEffect, useState } from 'react';
import * as d3 from 'd3';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

const GRADE_COLORS: Record<string, string> = {
  'A+': '#10b981', 'A': '#22c55e', 'B': '#84cc16',
  'C': '#f59e0b', 'D': '#f97316', 'F': '#dc2626', 'N/A': '#6b7280',
};

function CSPSunburst({ csp }: { csp: any }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);

  useEffect(() => {
    if (!svgRef.current || !csp?.parsed || Object.keys(csp.parsed).length === 0) return;

    const width = 360;
    const height = 360;
    const radius = width / 2;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    svg.attr('viewBox', `0 0 ${width} ${height}`);

    const data = {
      name: 'CSP',
      children: Object.entries(csp.parsed).map(([directive, sources]: [string, any]) => ({
        name: directive,
        children: (sources as string[]).map((src) => ({
          name: src,
          value: 1,
          unsafe: src.includes('unsafe') || src === '*',
        })),
      })),
    };

    const root = d3.hierarchy(data as any)
      .sum((d: any) => d.value || 0)
      .sort((a, b) => (b.value || 0) - (a.value || 0));

    d3.partition().size([2 * Math.PI, radius])(root as any);

    const arc = d3.arc<any>()
      .startAngle((d) => d.x0)
      .endAngle((d) => d.x1)
      .padAngle(0.01)
      .padRadius(radius / 2)
      .innerRadius((d) => d.y0)
      .outerRadius((d) => d.y1 - 1);

    const colorScale = d3.scaleOrdinal(d3.schemeTableau10);

    const g = svg.append('g').attr('transform', `translate(${width / 2}, ${height / 2})`);

    g.selectAll('path')
      .data(root.descendants().filter((d) => d.depth > 0))
      .join('path')
      .attr('d', arc)
      .attr('fill', (d: any) => {
        if (d.data.unsafe) return '#dc2626';
        if (d.depth === 1) return colorScale(d.data.name);
        return d3.color(colorScale(d.parent.data.name))?.brighter(0.5).toString() || '#888';
      })
      .attr('fill-opacity', 0.85)
      .attr('stroke', 'rgba(0,0,0,0.2)')
      .style('cursor', 'pointer')
      .on('mouseenter', function (event, d: any) {
        d3.select(this).attr('fill-opacity', 1);
        const rect = containerRef.current?.getBoundingClientRect();
        setTooltip({
          x: event.clientX - (rect?.left || 0),
          y: event.clientY - (rect?.top || 0),
          text: d.data.unsafe ? `⚠️ ${d.data.name} (unsafe)` : d.data.name,
        });
      })
      .on('mouseleave', function () {
        d3.select(this).attr('fill-opacity', 0.85);
        setTooltip(null);
      });

    // Center label
    g.append('text')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('fill', GRADE_COLORS[csp.grade] || '#6b7280')
      .attr('font-size', 28)
      .attr('font-weight', 800)
      .text(csp.grade);

    g.append('text')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('y', 20)
      .attr('fill', 'currentColor')
      .attr('class', 'text-muted-foreground')
      .attr('font-size', 10)
      .text('CSP Grade');

  }, [csp]);

  return (
    <div ref={containerRef} className="relative">
      <svg ref={svgRef} className="w-full h-auto max-w-sm mx-auto" />
      {tooltip && (
        <div className="d3-tooltip" style={{ left: tooltip.x, top: tooltip.y - 30 }}>
          {tooltip.text}
        </div>
      )}
    </div>
  );
}

export function CSPPanel({ result }: { result: any }) {
  const csp = result.csp;

  if (!csp || !csp.raw) {
    return (
      <div className="glass-card p-8 text-center space-y-3">
        <AlertTriangle className="w-10 h-10 text-red-400 mx-auto" />
        <h3 className="font-semibold text-foreground">No Content-Security-Policy Found</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          This site does not implement a CSP header, leaving it fully exposed to XSS-based attacks.
          Adding even a basic CSP significantly reduces attack surface.
        </p>
        <pre className="text-xs font-mono bg-muted rounded-lg p-3 text-left max-w-md mx-auto mt-4">
          Content-Security-Policy: default-src 'self';{'\n'}
          script-src 'self' 'nonce-RANDOM';{'\n'}
          style-src 'self' 'unsafe-inline';{'\n'}
          img-src 'self' data: https:;{'\n'}
          upgrade-insecure-requests;
        </pre>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="viz-container p-4">
        <p className="text-xs font-mono text-muted-foreground mb-2 uppercase tracking-wider">
          ◆ CSP Directive Sunburst
        </p>
        <CSPSunburst csp={csp} />
      </div>

      <div className="space-y-4">
        <div className="glass-card p-4">
          <p className="text-xs text-muted-foreground mb-2">Raw Policy</p>
          <pre className="text-xs font-mono bg-muted rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all">
            {csp.raw}
          </pre>
        </div>

        {csp.violations?.length > 0 && (
          <div className="glass-card p-4">
            <p className="text-xs font-medium text-muted-foreground mb-3 uppercase">Violations</p>
            <div className="space-y-2">
              {csp.violations.map((v: any, i: number) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <AlertTriangle size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-mono text-foreground">{v.directive}</span>
                    <span className="text-muted-foreground"> — {v.message}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="glass-card p-3">
            <p className="text-xs text-muted-foreground">Nonces Found</p>
            <p className="text-lg font-bold text-foreground">{csp.nonces?.length || 0}</p>
          </div>
          <div className="glass-card p-3">
            <p className="text-xs text-muted-foreground">Hashes Found</p>
            <p className="text-lg font-bold text-foreground">{csp.hashes?.length || 0}</p>
          </div>
          <div className="glass-card p-3 flex items-center gap-2">
            {csp.strictMode ? <CheckCircle2 size={14} className="text-emerald-400" /> : <AlertTriangle size={14} className="text-amber-400" />}
            <p className="text-xs text-foreground">Strict Mode</p>
          </div>
          <div className="glass-card p-3 flex items-center gap-2">
            {csp.reportingEnabled ? <CheckCircle2 size={14} className="text-emerald-400" /> : <AlertTriangle size={14} className="text-amber-400" />}
            <p className="text-xs text-foreground">Reporting</p>
          </div>
        </div>
      </div>
    </div>
  );
}
