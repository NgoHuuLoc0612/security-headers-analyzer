'use client';
// apps/web/src/components/analysis/result-tabs.tsx
import React, { useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { HeadersPanel } from './panels/headers-panel';
import { RadarChartPanel } from './panels/radar-chart-panel';
import { TLSPanel } from './panels/tls-panel';
import { CSPPanel } from './panels/csp-panel';
import { ReputationPanel } from './panels/reputation-panel';
import { DNSPanel } from './panels/dns-panel';
import { Globe3DPanel } from './panels/globe-3d-panel';
import { ImprovementsPanel } from './panels/improvements-panel';
import { CompliancePanel } from './panels/compliance-panel';
import { TreemapPanel } from './panels/treemap-panel';

const TABS = [
  { id: 'overview',     label: 'Overview',     icon: '📊' },
  { id: 'headers',      label: 'Headers',      icon: '🛡️' },
  { id: 'csp',          label: 'CSP',          icon: '🔐' },
  { id: 'tls',          label: 'TLS/SSL',      icon: '🔒' },
  { id: 'dns',          label: 'DNS',          icon: '🌐' },
  { id: 'reputation',   label: 'Reputation',   icon: '🦠' },
  { id: 'globe',        label: '3D Globe',     icon: '🌍' },
  { id: 'compliance',   label: 'Compliance',   icon: '📋' },
  { id: 'improvements', label: 'Improve',      icon: '✨' },
];

export function ResultTabs({ result }: { result: any }) {
  const [active, setActive] = useState('overview');

  return (
    <div className="space-y-6">
      {/* Tab nav */}
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActive(tab.id)}
            className={cn(
              'flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all',
              active === tab.id
                ? 'bg-primary text-primary-foreground shadow-md'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted',
            )}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="min-h-[400px]">
        {active === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <RadarChartPanel result={result} />
            <TreemapPanel result={result} />
          </div>
        )}
        {active === 'headers' && <HeadersPanel result={result} />}
        {active === 'csp' && <CSPPanel result={result} />}
        {active === 'tls' && <TLSPanel result={result} />}
        {active === 'dns' && <DNSPanel result={result} />}
        {active === 'reputation' && <ReputationPanel result={result} />}
        {active === 'globe' && <Globe3DPanel result={result} />}
        {active === 'compliance' && <CompliancePanel result={result} />}
        {active === 'improvements' && <ImprovementsPanel result={result} />}
      </div>
    </div>
  );
}
