'use client';
// apps/web/src/app/page.tsx
import React, { Suspense } from 'react';
import { SHAHeader } from '@/components/layout/sha-header';
import { HeroAnalyzer } from '@/components/analysis/hero-analyzer';
import { RealtimePipeline } from '@/components/dashboard/realtime-pipeline';
import { StatsOverview } from '@/components/dashboard/stats-overview';
import { LeaderboardCard } from '@/components/dashboard/leaderboard-card';
import { RecentScans } from '@/components/dashboard/recent-scans';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Background grid */}
      <div className="fixed inset-0 bg-grid-dark bg-[size:40px_40px] opacity-100 pointer-events-none" />
      <div className="fixed inset-0 bg-hero-gradient pointer-events-none" />

      <SHAHeader />

      <main className="relative z-10">
        {/* Hero Section */}
        <section className="pt-24 pb-16 px-4">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium mb-6">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary" />
                </span>
                LIVE ANALYSIS ENGINE · MULTI-WORKER PIPELINE
              </div>
              <h1 className="text-5xl sm:text-6xl md:text-7xl font-extrabold tracking-tight mb-6">
                <span className="text-gradient">Security Headers</span>
                <br />
                <span className="text-foreground">Analyzer</span>
              </h1>
              <p className="text-muted-foreground text-xl max-w-2xl mx-auto leading-relaxed">
                Analysis pipeline. Inspect TLS, CSP, HSTS, DNS, reputation,
                and every security header — with 3D visualizations and realtime streaming.
              </p>
            </div>

            <HeroAnalyzer />
          </div>
        </section>

        {/* Realtime Pipeline Visualization */}
        <section className="py-12 px-4">
          <div className="max-w-6xl mx-auto">
            <div className="flex items-center gap-3 mb-6">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">
                Live Pipeline
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <RealtimePipeline />
          </div>
        </section>

        {/* Stats */}
        <section className="py-12 px-4">
          <div className="max-w-6xl mx-auto">
            <Suspense fallback={<div className="h-32 rounded-xl bg-muted animate-pulse" />}>
              <StatsOverview />
            </Suspense>
          </div>
        </section>

        {/* Leaderboard + Recent */}
        <section className="py-12 px-4">
          <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Suspense fallback={<div className="h-64 rounded-xl bg-muted animate-pulse" />}>
              <LeaderboardCard />
            </Suspense>
            <Suspense fallback={<div className="h-64 rounded-xl bg-muted animate-pulse" />}>
              <RecentScans />
            </Suspense>
          </div>
        </section>
      </main>
    </div>
  );
}
