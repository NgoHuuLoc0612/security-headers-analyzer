'use client';
// apps/web/src/components/analysis/panels/reputation-panel.tsx
import React, { useRef, useEffect } from 'react';
import * as d3 from 'd3';
import { Bug, ShieldCheck, ShieldAlert, Calendar, Building } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { format } from 'date-fns';

function VTGauge({ vt }: { vt: any }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !vt) return;
    const size = 200;
    const radius = size / 2 - 16;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    svg.attr('viewBox', `0 0 ${size} ${size}`);

    const g = svg.append('g').attr('transform', `translate(${size / 2}, ${size / 2})`);

    const data = [
      { label: 'Clean', value: vt.clean || 0, color: '#10b981' },
      { label: 'Malicious', value: vt.malicious || 0, color: '#dc2626' },
      { label: 'Suspicious', value: vt.suspicious || 0, color: '#f59e0b' },
      { label: 'Undetected', value: vt.undetected || 0, color: '#6b7280' },
    ];

    const pie = d3.pie<typeof data[0]>().value((d) => d.value).sort(null);
    const arc = d3.arc<any>().innerRadius(radius * 0.6).outerRadius(radius);

    g.selectAll('path')
      .data(pie(data))
      .join('path')
      .attr('fill', (d) => d.data.color)
      .attr('fill-opacity', 0.85)
      .transition()
      .duration(800)
      .attrTween('d', function (d) {
        const interpolate = d3.interpolate({ startAngle: 0, endAngle: 0 }, d);
        return (t) => arc(interpolate(t)) || '';
      });

    g.append('text')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('fill', vt.malicious > 0 ? '#dc2626' : '#10b981')
      .attr('font-size', 24)
      .attr('font-weight', 800)
      .text(vt.malicious > 0 ? '⚠' : '✓');

    g.append('text')
      .attr('text-anchor', 'middle')
      .attr('y', 20)
      .attr('fill', 'currentColor')
      .attr('class', 'text-muted-foreground')
      .attr('font-size', 9)
      .text(`${vt.totalEngines} engines`);
  }, [vt]);

  return <svg ref={svgRef} className="w-full h-auto max-w-[200px] mx-auto" />;
}

export function ReputationPanel({ result }: { result: any }) {
  const vt = result.virusTotal;
  const rdap = result.rdap;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* VirusTotal */}
      <div className="glass-card p-5">
        <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wider flex items-center gap-1.5">
          <Bug size={12} /> VirusTotal Analysis
        </p>
        {vt ? (
          <>
            <VTGauge vt={vt} />
            <div className="grid grid-cols-2 gap-2 mt-4">
              {[
                { label: 'Malicious', value: vt.malicious, color: 'text-red-400' },
                { label: 'Suspicious', value: vt.suspicious, color: 'text-amber-400' },
                { label: 'Clean', value: vt.clean, color: 'text-emerald-400' },
                { label: 'Reputation', value: vt.reputation, color: 'text-blue-400' },
              ].map((s) => (
                <div key={s.label} className="bg-muted/30 rounded-lg p-2.5 text-center">
                  <p className={cn('text-lg font-bold', s.color)}>{s.value ?? 0}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>
            {vt.threatNames?.length > 0 && (
              <div className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                <p className="text-xs text-red-400 font-medium mb-1">Threat names detected:</p>
                <p className="text-xs text-foreground">{vt.threatNames.join(', ')}</p>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-12">
            VirusTotal data not available (API key may not be configured or scan skipped)
          </p>
        )}
      </div>

      {/* RDAP */}
      <div className="glass-card p-5">
        <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wider flex items-center gap-1.5">
          <Building size={12} /> Domain Registration (RDAP)
        </p>
        {rdap ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
              <span className="text-sm text-muted-foreground">Domain Age</span>
              <span className="font-mono text-sm text-foreground">
                {rdap.ageInDays ? `${Math.floor(rdap.ageInDays / 365)}y ${rdap.ageInDays % 365}d` : '—'}
              </span>
            </div>
            {rdap.isDomainFresh && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <ShieldAlert size={14} className="text-amber-400 flex-shrink-0" />
                <span className="text-xs text-amber-400">Recently registered domain — exercise caution</span>
              </div>
            )}
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Registrar</span><span className="text-foreground">{rdap.registrar || '—'}</span></div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground flex items-center gap-1"><Calendar size={12} /> Created</span>
                <span className="font-mono text-foreground">
                  {rdap.createdDate ? format(new Date(rdap.createdDate), 'MMM d, yyyy') : '—'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground flex items-center gap-1"><Calendar size={12} /> Expires</span>
                <span className="font-mono text-foreground">
                  {rdap.expiresDate ? format(new Date(rdap.expiresDate), 'MMM d, yyyy') : '—'}
                </span>
              </div>
              <div className="flex justify-between"><span className="text-muted-foreground">Updated</span>
                <span className="font-mono text-foreground">
                  {rdap.updatedDate ? format(new Date(rdap.updatedDate), 'MMM d, yyyy') : '—'}
                </span>
              </div>
            </div>
            {rdap.status?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-2">
                {rdap.status.map((s: string) => (
                  <span key={s} className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                    {s}
                  </span>
                ))}
              </div>
            )}
            {rdap.nameservers?.length > 0 && (
              <div className="pt-2">
                <p className="text-xs text-muted-foreground mb-1">Nameservers</p>
                <div className="space-y-1">
                  {rdap.nameservers.map((ns: string) => (
                    <p key={ns} className="text-xs font-mono text-foreground">{ns}</p>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-12">
            RDAP data not available for this domain
          </p>
        )}
      </div>
    </div>
  );
}
