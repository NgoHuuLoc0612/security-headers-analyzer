'use client';
// apps/web/src/components/analysis/panels/radar-chart-panel.tsx
import React, { useRef, useEffect, useState } from 'react';
import * as d3 from 'd3';

export function RadarChartPanel({ result }: { result: any }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);

  const categories = result.score?.categories || {};
  const data = Object.entries(categories).map(([key, cat]: [string, any]) => ({
    axis: cat.label || key,
    value: (cat.score / (cat.maxScore || 100)) * 100,
    raw: cat.score,
    max: cat.maxScore,
  }));

  useEffect(() => {
    if (!svgRef.current || data.length === 0) return;

    const width = 420;
    const height = 420;
    const margin = 60;
    const radius = Math.min(width, height) / 2 - margin;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    svg.attr('viewBox', `0 0 ${width} ${height}`);

    const g = svg.append('g').attr('transform', `translate(${width / 2}, ${height / 2})`);

    const angleSlice = (Math.PI * 2) / data.length;
    const rScale = d3.scaleLinear().domain([0, 100]).range([0, radius]);

    // Grid circles
    const levels = 5;
    for (let level = 1; level <= levels; level++) {
      const r = (radius / levels) * level;
      g.append('circle')
        .attr('r', r)
        .attr('fill', 'none')
        .attr('stroke', 'currentColor')
        .attr('class', 'text-border')
        .attr('stroke-width', 1)
        .attr('opacity', 0.5);

      g.append('text')
        .attr('x', 4)
        .attr('y', -r)
        .attr('fill', 'currentColor')
        .attr('class', 'text-muted-foreground')
        .attr('font-size', 9)
        .text(`${Math.round((level / levels) * 100)}`);
    }

    // Axis lines and labels
    data.forEach((d, i) => {
      const angle = angleSlice * i - Math.PI / 2;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;

      g.append('line')
        .attr('x1', 0).attr('y1', 0)
        .attr('x2', x).attr('y2', y)
        .attr('stroke', 'currentColor')
        .attr('class', 'text-border')
        .attr('stroke-width', 1)
        .attr('opacity', 0.5);

      const labelX = Math.cos(angle) * (radius + 30);
      const labelY = Math.sin(angle) * (radius + 30);

      g.append('text')
        .attr('x', labelX)
        .attr('y', labelY)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('fill', 'currentColor')
        .attr('class', 'text-foreground')
        .attr('font-size', 11)
        .attr('font-weight', 500)
        .text(d.axis);
    });

    // Radar area
    const lineGenerator = d3.lineRadial<typeof data[0]>()
      .angle((_, i) => angleSlice * i)
      .radius((d) => rScale(d.value))
      .curve(d3.curveLinearClosed);

    const gradient = svg.append('defs').append('radialGradient')
      .attr('id', 'radarGradient');
    gradient.append('stop').attr('offset', '0%').attr('stop-color', '#6366f1').attr('stop-opacity', 0.6);
    gradient.append('stop').attr('offset', '100%').attr('stop-color', '#06b6d4').attr('stop-opacity', 0.15);

    const path = g.append('path')
      .datum(data)
      .attr('fill', 'url(#radarGradient)')
      .attr('stroke', '#6366f1')
      .attr('stroke-width', 2)
      .attr('opacity', 0);

    // Animate from center
    const zeroData = data.map((d) => ({ ...d, value: 0 }));
    path.attr('d', lineGenerator(zeroData as any));

    path.transition()
      .duration(1000)
      .ease(d3.easeCubicOut)
      .attr('opacity', 1)
      .attrTween('d', function () {
        const interpolator = d3.interpolate(zeroData, data);
        return (t: number) => lineGenerator(interpolator(t) as any) || '';
      });

    // Data points
    data.forEach((d, i) => {
      const angle = angleSlice * i - Math.PI / 2;

      const circle = g.append('circle')
        .attr('cx', 0)
        .attr('cy', 0)
        .attr('r', 4)
        .attr('fill', '#6366f1')
        .attr('stroke', 'white')
        .attr('stroke-width', 1.5)
        .style('cursor', 'pointer')
        .on('mouseenter', (event) => {
          const rect = containerRef.current?.getBoundingClientRect();
          setTooltip({
            x: event.clientX - (rect?.left || 0),
            y: event.clientY - (rect?.top || 0),
            text: `${d.axis}: ${d.raw.toFixed(1)}/${d.max} (${d.value.toFixed(0)}%)`,
          });
        })
        .on('mouseleave', () => setTooltip(null));

      circle.transition()
        .duration(1000)
        .ease(d3.easeCubicOut)
        .attr('cx', Math.cos(angle) * rScale(d.value))
        .attr('cy', Math.sin(angle) * rScale(d.value));
    });

  }, [data]);

  return (
    <div ref={containerRef} className="viz-container p-4 relative">
      <p className="text-xs font-mono text-muted-foreground mb-2 uppercase tracking-wider">
        ◆ Security Category Radar
      </p>
      <svg ref={svgRef} className="w-full h-auto max-w-md mx-auto" />
      {tooltip && (
        <div
          className="d3-tooltip"
          style={{ left: tooltip.x, top: tooltip.y - 40 }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
}
