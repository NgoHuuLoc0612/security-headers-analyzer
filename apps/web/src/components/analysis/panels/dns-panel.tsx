'use client';
// apps/web/src/components/analysis/panels/dns-panel.tsx
import React, { useRef, useEffect } from 'react';
import * as d3 from 'd3';
import { Network, Mail, Shield, Globe } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

function DNSForceGraph({ dns, domain }: { dns: any; domain: string }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;

    const width = 500;
    const height = 380;

    const nodes: any[] = [{ id: domain, type: 'root', label: domain }];
    const links: any[] = [];

    (dns?.ipv4 || []).forEach((ip: string) => {
      nodes.push({ id: ip, type: 'ipv4', label: ip });
      links.push({ source: domain, target: ip });
    });
    (dns?.ipv6 || []).slice(0, 2).forEach((ip: string) => {
      nodes.push({ id: ip, type: 'ipv6', label: ip.substring(0, 20) + '...' });
      links.push({ source: domain, target: ip });
    });
    (dns?.ns || []).forEach((ns: string) => {
      nodes.push({ id: ns, type: 'ns', label: ns });
      links.push({ source: domain, target: ns });
    });
    (dns?.mx || []).slice(0, 3).forEach((mx: any) => {
      const id = `mx-${mx.exchange}`;
      nodes.push({ id, type: 'mx', label: mx.exchange });
      links.push({ source: domain, target: id });
    });

    const colorMap: Record<string, string> = {
      root: '#6366f1', ipv4: '#10b981', ipv6: '#06b6d4', ns: '#f59e0b', mx: '#ec4899',
    };
    const sizeMap: Record<string, number> = { root: 22, ipv4: 12, ipv6: 12, ns: 14, mx: 12 };

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    svg.attr('viewBox', `0 0 ${width} ${height}`);

    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id((d: any) => d.id).distance(90))
      .force('charge', d3.forceManyBody().strength(-180))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide().radius((d: any) => sizeMap[d.type] + 10));

    const link = svg.append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', 'currentColor')
      .attr('class', 'text-border')
      .attr('stroke-width', 1.5)
      .attr('opacity', 0.4);

    const node = svg.append('g')
      .selectAll('g')
      .data(nodes)
      .join('g')
      .call(
        d3.drag<any, any>()
          .on('start', (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x; d.fy = d.y;
          })
          .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y; })
          .on('end', (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null; d.fy = null;
          }) as any,
      );

    node.append('circle')
      .attr('r', (d: any) => sizeMap[d.type])
      .attr('fill', (d: any) => colorMap[d.type])
      .attr('fill-opacity', 0.2)
      .attr('stroke', (d: any) => colorMap[d.type])
      .attr('stroke-width', 2);

    node.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', (d: any) => sizeMap[d.type] + 14)
      .attr('fill', 'currentColor')
      .attr('class', 'text-foreground')
      .attr('font-size', 9)
      .text((d: any) => d.label);

    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);
      node.attr('transform', (d: any) => `translate(${d.x}, ${d.y})`);
    });

    return () => { simulation.stop(); };
  }, [dns, domain]);

  return <svg ref={svgRef} className="w-full h-auto" />;
}

export function DNSPanel({ result }: { result: any }) {
  const dns = result.dns;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="viz-container p-4">
        <p className="text-xs font-mono text-muted-foreground mb-2 uppercase tracking-wider">
          ◆ DNS Topology Graph
        </p>
        <DNSForceGraph dns={dns} domain={result.domain} />
      </div>

      <div className="space-y-4">
        <div className="glass-card p-5">
          <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wider flex items-center gap-1.5">
            <Globe size={12} /> Email Security
          </p>
          <div className="space-y-2">
            {[
              { label: 'SPF', value: dns?.spf, icon: Mail },
              { label: 'DKIM', value: dns?.dkim, icon: Shield },
              { label: 'DMARC', value: dns?.dmarc, icon: Shield },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30">
                <span className="flex items-center gap-2 text-sm text-foreground">
                  <Icon size={14} className={value ? 'text-emerald-400' : 'text-red-400'} />
                  {label}
                </span>
                <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', value ? 'sev-low' : 'sev-high')}>
                  {value ? 'Configured' : 'Missing'}
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30">
              <span className="text-sm text-foreground">DNSSEC</span>
              <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', dns?.dnssec ? 'sev-low' : 'sev-medium')}>
                {dns?.dnssec ? 'Enabled' : 'Disabled'}
              </span>
            </div>
          </div>
        </div>

        <div className="glass-card p-5">
          <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wider">IP Addresses</p>
          <div className="space-y-1.5">
            {(dns?.ipv4 || []).map((ip: string) => (
              <div key={ip} className="flex items-center justify-between text-sm font-mono">
                <span className="text-foreground">{ip}</span>
                <span className="text-xs text-muted-foreground">{dns?.rdns?.[ip] || ''}</span>
              </div>
            ))}
            {(!dns?.ipv4 || dns.ipv4.length === 0) && (
              <p className="text-sm text-muted-foreground">No IPv4 addresses found</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
