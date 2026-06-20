'use client';
// apps/web/src/components/dashboard/realtime-pipeline.tsx
import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { api } from '@/lib/api/client';

interface QueueNode {
  id: string;
  label: string;
  type: 'gateway' | 'orchestrator' | 'queue' | 'worker' | 'storage' | 'external';
  x: number;
  y: number;
  waiting?: number;
  active?: number;
  color: string;
}

interface QueueLink {
  source: string;
  target: string;
  label?: string;
  animated?: boolean;
}

const NODES: QueueNode[] = [
  { id: 'nextjs',      label: 'Next.js\nUI',          type: 'gateway',      x: 80,  y: 150, color: '#6366f1' },
  { id: 'gateway',     label: 'NestJS\nAPI Gateway',  type: 'gateway',      x: 220, y: 150, color: '#8b5cf6' },
  { id: 'zod',         label: 'Zod\nValidation',      type: 'queue',        x: 220, y: 240, color: '#7c3aed' },
  { id: 'orchestrator',label: 'Job\nOrchestrator',    type: 'orchestrator', x: 380, y: 150, color: '#0ea5e9' },
  { id: 'redis',       label: 'Redis\n(Memurai)',      type: 'storage',      x: 380, y: 270, color: '#ef4444' },
  { id: 'io_queue',    label: 'IO Queue',             type: 'queue',        x: 540, y: 80,  color: '#f59e0b' },
  { id: 'cpu_queue',   label: 'CPU Queue',            type: 'queue',        x: 540, y: 170, color: '#10b981' },
  { id: 'api_queue',   label: 'API Queue',            type: 'queue',        x: 540, y: 260, color: '#3b82f6' },
  { id: 'io_worker',   label: 'IO Workers\n(×20)',    type: 'worker',       x: 700, y: 80,  color: '#f59e0b' },
  { id: 'cpu_worker',  label: 'CPU Workers\n(×4)',    type: 'worker',       x: 700, y: 170, color: '#10b981' },
  { id: 'api_worker',  label: 'API Workers\n(×8)',    type: 'worker',       x: 700, y: 260, color: '#3b82f6' },
  { id: 'ssl_labs',    label: 'SSL Labs',             type: 'external',     x: 860, y: 100, color: '#06b6d4' },
  { id: 'virustotal',  label: 'VirusTotal',           type: 'external',     x: 860, y: 200, color: '#f97316' },
  { id: 'rdap',        label: 'RDAP',                 type: 'external',     x: 860, y: 300, color: '#a78bfa' },
  { id: 'rule_engine', label: 'Rule\nEngine',         type: 'orchestrator', x: 700, y: 360, color: '#ec4899' },
  { id: 'prisma',      label: 'Prisma\nORM',          type: 'queue',        x: 540, y: 360, color: '#64748b' },
  { id: 'postgres',    label: 'PostgreSQL\n(EDB)',     type: 'storage',      x: 380, y: 360, color: '#84cc16' },
  { id: 'viz',         label: 'D3.js\nVisualization', type: 'gateway',      x: 220, y: 360, color: '#f59e0b' },
];

const LINKS: QueueLink[] = [
  { source: 'nextjs',      target: 'gateway',      animated: true },
  { source: 'gateway',     target: 'zod',          label: 'validate' },
  { source: 'gateway',     target: 'orchestrator', animated: true },
  { source: 'orchestrator',target: 'redis',        label: 'cache' },
  { source: 'orchestrator',target: 'io_queue',     animated: true },
  { source: 'orchestrator',target: 'cpu_queue',    animated: true },
  { source: 'orchestrator',target: 'api_queue',    animated: true },
  { source: 'io_queue',    target: 'io_worker',    animated: true },
  { source: 'cpu_queue',   target: 'cpu_worker',   animated: true },
  { source: 'api_queue',   target: 'api_worker',   animated: true },
  { source: 'api_worker',  target: 'ssl_labs',     label: 'SSL' },
  { source: 'api_worker',  target: 'virustotal',   label: 'VT' },
  { source: 'api_worker',  target: 'rdap',         label: 'RDAP' },
  { source: 'cpu_worker',  target: 'rule_engine',  animated: true },
  { source: 'rule_engine', target: 'prisma',       animated: true },
  { source: 'prisma',      target: 'postgres',     animated: true },
  { source: 'postgres',    target: 'viz',          animated: true },
  { source: 'viz',         target: 'nextjs',       animated: true },
];

export function RealtimePipeline() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [metrics, setMetrics] = useState<Record<string, any>>({});
  const [dimensions, setDimensions] = useState({ width: 960, height: 460 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const data = await api.getQueueMetrics();
        setMetrics(data);
      } catch {}
    };
    fetchMetrics();
    const iv = setInterval(fetchMetrics, 5000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const resizeObs = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        setDimensions({ width: w, height: Math.max(400, w * 0.48) });
      }
    });
    if (containerRef.current) resizeObs.observe(containerRef.current);
    return () => resizeObs.disconnect();
  }, []);

  useEffect(() => {
    if (!svgRef.current) return;
    const { width, height } = dimensions;
    const scaleX = width / 960;
    const scaleY = height / 460;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    svg.attr('viewBox', `0 0 ${width} ${height}`);

    // Defs
    const defs = svg.append('defs');

    // Glow filter
    const glow = defs.append('filter').attr('id', 'glow');
    glow.append('feGaussianBlur').attr('stdDeviation', '3').attr('result', 'coloredBlur');
    const feMerge = glow.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'coloredBlur');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    // Arrow markers
    NODES.forEach((node) => {
      defs.append('marker')
        .attr('id', `arrow-${node.id}`)
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 28)
        .attr('refY', 0)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-5L10,0L0,5')
        .attr('fill', node.color)
        .attr('opacity', 0.7);
    });

    // Generic arrow
    defs.append('marker')
      .attr('id', 'arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 28)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#4b5563')
      .attr('opacity', 0.7);

    const nodeMap = new Map(NODES.map((n) => [n.id, n]));

    // Links
    const linkGroup = svg.append('g').attr('class', 'links');

    LINKS.forEach((link, i) => {
      const src = nodeMap.get(link.source)!;
      const tgt = nodeMap.get(link.target)!;
      if (!src || !tgt) return;

      const sx = src.x * scaleX;
      const sy = src.y * scaleY;
      const tx = tgt.x * scaleX;
      const ty = tgt.y * scaleY;

      // Curved path
      const midX = (sx + tx) / 2;
      const midY = (sy + ty) / 2;
      const dx = tx - sx;
      const dy = ty - sy;
      const pathD = `M${sx},${sy} Q${midX + dy * 0.1},${midY - dx * 0.1} ${tx},${ty}`;

      const pathEl = linkGroup.append('path')
        .attr('d', pathD)
        .attr('fill', 'none')
        .attr('stroke', link.animated ? tgt.color : '#374151')
        .attr('stroke-width', link.animated ? 1.5 : 1)
        .attr('stroke-opacity', link.animated ? 0.6 : 0.3)
        .attr('marker-end', 'url(#arrow)');

      if (link.animated) {
        const pathLength = (pathEl.node() as SVGPathElement).getTotalLength?.() || 200;
        pathEl
          .attr('stroke-dasharray', `${pathLength / 6} ${pathLength}`)
          .attr('stroke-dashoffset', pathLength)
          .transition()
          .duration(2000 + i * 300)
          .ease(d3.easeLinear)
          .attr('stroke-dashoffset', 0)
          .on('end', function repeat(this: SVGPathElement) {
            d3.select(this)
              .attr('stroke-dashoffset', pathLength)
              .transition()
              .duration(2000)
              .ease(d3.easeLinear)
              .attr('stroke-dashoffset', 0)
              .on('end', repeat);
          });
      }

      // Link label
      if (link.label) {
        linkGroup.append('text')
          .attr('x', midX)
          .attr('y', midY)
          .attr('text-anchor', 'middle')
          .attr('fill', '#6b7280')
          .attr('font-size', 9 * Math.min(scaleX, scaleY))
          .text(link.label);
      }
    });

    // Nodes
    const nodeGroup = svg.append('g').attr('class', 'nodes');

    NODES.forEach((node) => {
      const nx = node.x * scaleX;
      const ny = node.y * scaleY;
      const queueData = metrics[node.id.replace('_queue', '')] || metrics[node.id] || null;

      const g = nodeGroup.append('g')
        .attr('transform', `translate(${nx}, ${ny})`)
        .attr('cursor', 'pointer')
        .on('mouseenter', function () {
          d3.select(this).select('rect').attr('filter', 'url(#glow)');
        })
        .on('mouseleave', function () {
          d3.select(this).select('rect').attr('filter', null);
        });

      // Node background
      const nodeW = 80 * Math.min(scaleX, scaleY);
      const nodeH = 40 * Math.min(scaleX, scaleY);

      g.append('rect')
        .attr('x', -nodeW / 2)
        .attr('y', -nodeH / 2)
        .attr('width', nodeW)
        .attr('height', nodeH)
        .attr('rx', 8 * Math.min(scaleX, scaleY))
        .attr('fill', `${node.color}15`)
        .attr('stroke', node.color)
        .attr('stroke-width', 1.5)
        .attr('stroke-opacity', 0.7);

      // Node text
      const lines = node.label.split('\n');
      lines.forEach((line, li) => {
        g.append('text')
          .attr('x', 0)
          .attr('y', (li - (lines.length - 1) / 2) * 12 * Math.min(scaleX, scaleY))
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'middle')
          .attr('fill', node.color)
          .attr('font-size', 10 * Math.min(scaleX, scaleY))
          .attr('font-weight', '500')
          .text(line);
      });

      // Queue depth badge
      if (queueData && (queueData.waiting > 0 || queueData.active > 0)) {
        const badge = g.append('g').attr('transform', `translate(${nodeW / 2 - 4 * scaleX}, ${-nodeH / 2 + 4 * scaleY})`);
        badge.append('circle')
          .attr('r', 8 * Math.min(scaleX, scaleY))
          .attr('fill', queueData.waiting > 10 ? '#ef4444' : '#10b981');
        badge.append('text')
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'middle')
          .attr('fill', 'white')
          .attr('font-size', 7 * Math.min(scaleX, scaleY))
          .attr('font-weight', 'bold')
          .text(queueData.active || queueData.waiting || 0);
      }
    });

    // Title
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', 20)
      .attr('text-anchor', 'middle')
      .attr('fill', '#4b5563')
      .attr('font-size', 11)
      .attr('font-family', 'monospace')
      .text('▶ LIVE ANALYSIS PIPELINE — MULTI-WORKER ARCHITECTURE');

  }, [dimensions, metrics]);

  return (
    <div
      ref={containerRef}
      className="viz-container p-4 w-full overflow-hidden"
      style={{ minHeight: 300 }}
    >
      <svg
        ref={svgRef}
        className="w-full h-auto"
        style={{ minHeight: 280 }}
      />
    </div>
  );
}
