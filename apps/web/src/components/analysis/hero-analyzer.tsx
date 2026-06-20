'use client';
// apps/web/src/components/analysis/hero-analyzer.tsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Shield, Globe, Lock, AlertTriangle, CheckCircle2,
  ChevronRight, Zap, Loader2, X, Settings2, Plus
} from 'lucide-react';
import { api, createSSEStream } from '@/lib/api/client';
import { cn } from '@/lib/utils/cn';
import { AnalysisPipelineProgress } from './analysis-pipeline-progress';
import toast from 'react-hot-toast';

const EXAMPLE_URLS = [
  'https://github.com',
  'https://mozilla.org',
  'https://cloudflare.com',
  'https://stripe.com',
  'https://google.com',
];

const PIPELINE_STAGES = [
  { id: 'QUEUED',          label: 'Queued',           icon: '⏳' },
  { id: 'DNS_RESOLUTION',  label: 'DNS Resolution',   icon: '🔍' },
  { id: 'TLS_HANDSHAKE',   label: 'TLS Handshake',    icon: '🔒' },
  { id: 'HTTP_FETCH',      label: 'HTTP Fetch',        icon: '🌐' },
  { id: 'SSL_LABS',        label: 'SSL Labs',          icon: '🛡️' },
  { id: 'VIRUS_TOTAL',     label: 'VirusTotal',        icon: '🦠' },
  { id: 'RDAP',            label: 'RDAP Lookup',       icon: '📋' },
  { id: 'RULE_ENGINE',     label: 'Rule Engine',       icon: '⚙️' },
  { id: 'SCORING',         label: 'Scoring',           icon: '📊' },
  { id: 'PERSISTING',      label: 'Persisting',        icon: '💾' },
  { id: 'COMPLETE',        label: 'Complete',          icon: '✅' },
];

export function HeroAnalyzer() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [jobInfo, setJobInfo] = useState<any>(null);
  const [stage, setStage] = useState('');
  const [progress, setProgress] = useState(0);
  const [showOptions, setShowOptions] = useState(false);
  const [options, setOptions] = useState({
    includeSSLGrade: true,
    includeVirusTotal: true,
    includeRDAP: true,
    priority: 'normal',
  });
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkUrls, setBulkUrls] = useState<string[]>(['']);
  const inputRef = useRef<HTMLInputElement>(null);
  const streamCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    return () => streamCleanupRef.current?.();
  }, []);

  const normalizeUrl = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return '';
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      return `https://${trimmed}`;
    }
    return trimmed;
  };

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const targetUrl = normalizeUrl(url);
    if (!targetUrl) { toast.error('Enter a URL to analyze'); return; }

    setLoading(true);
    setStage('QUEUED');
    setProgress(0);

    try {
      const result = await api.submitAnalysis(targetUrl, options);

      if (result.status === 'rejected') {
        toast.error(`Queue full: ${result.reason}. Try again shortly.`);
        setLoading(false);
        return;
      }

      setJobInfo(result);
      toast.success(`Analysis queued · ${result.correlationId.substring(0, 8)}`, { duration: 3000 });

      // Stream progress via SSE
      streamCleanupRef.current = createSSEStream(
        result.correlationId,
        (event) => {
          if (event.type === 'job:progress' || event.type === 'job:stage') {
            setStage(event.data?.stage || '');
            setProgress(event.data?.progress || 0);
          }
          if (event.type === 'job:completed') {
            setStage('COMPLETE');
            setProgress(100);
            toast.success(`Analysis complete! Grade: ${event.data?.grade || '?'}`, { duration: 5000 });
            setTimeout(() => {
              router.push(`/analyze/${event.data?.resultId || result.correlationId}`);
            }, 1500);
          }
          if (event.type === 'job:failed') {
            toast.error(`Analysis failed: ${event.data?.error || 'Unknown error'}`);
            setLoading(false);
          }
        },
        () => {},
        () => setLoading(false),
      );
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit analysis');
      setLoading(false);
    }
  }, [url, options, router]);

  const currentStageIndex = PIPELINE_STAGES.findIndex((s) => s.id === stage);

  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* URL Input */}
      <div className="glass-card p-1">
        <form onSubmit={handleSubmit} className="flex items-center gap-2 p-2">
          <div className="flex-1 flex items-center gap-3 px-3">
            <Globe size={18} className="text-muted-foreground flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              disabled={loading}
              className="flex-1 bg-transparent text-foreground placeholder-muted-foreground text-base outline-none font-mono"
              autoComplete="off"
              spellCheck={false}
            />
            {url && !loading && (
              <button
                type="button"
                onClick={() => setUrl('')}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowOptions(!showOptions)}
            className={cn(
              'p-2.5 rounded-lg transition-colors',
              showOptions ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted',
            )}
            title="Options"
          >
            <Settings2 size={16} />
          </button>

          <button
            type="submit"
            disabled={loading || !url.trim()}
            className={cn(
              'flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-sm transition-all duration-200',
              'bg-primary text-primary-foreground',
              'hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed',
              loading && 'cursor-not-allowed',
            )}
          >
            {loading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Shield size={16} />
            )}
            {loading ? 'Analyzing...' : 'Analyze'}
          </button>
        </form>

        {/* Options panel */}
        <AnimatePresence>
          {showOptions && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden border-t border-border/50"
            >
              <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { key: 'includeSSLGrade', label: 'SSL Labs', icon: '🔒' },
                  { key: 'includeVirusTotal', label: 'VirusTotal', icon: '🦠' },
                  { key: 'includeRDAP', label: 'RDAP', icon: '📋' },
                ].map(({ key, label, icon }) => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer group">
                    <div
                      onClick={() => setOptions((prev) => ({ ...prev, [key]: !prev[key as keyof typeof prev] }))}
                      className={cn(
                        'w-8 h-4 rounded-full transition-colors relative cursor-pointer',
                        (options as any)[key] ? 'bg-primary' : 'bg-muted',
                      )}
                    >
                      <div
                        className={cn(
                          'absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform shadow-sm',
                          (options as any)[key] ? 'translate-x-4' : 'translate-x-0.5',
                        )}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
                      {icon} {label}
                    </span>
                  </label>
                ))}

                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Priority:</span>
                  <select
                    value={options.priority}
                    onChange={(e) => setOptions((p) => ({ ...p, priority: e.target.value }))}
                    className="text-xs bg-muted border-0 rounded px-2 py-1 text-foreground outline-none"
                  >
                    {['low', 'normal', 'high', 'critical'].map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Example URLs */}
      {!loading && (
        <div className="flex items-center gap-2 mt-3 flex-wrap justify-center">
          <span className="text-xs text-muted-foreground">Try:</span>
          {EXAMPLE_URLS.map((exUrl) => (
            <button
              key={exUrl}
              onClick={() => setUrl(exUrl)}
              className="text-xs px-2.5 py-1 rounded-full bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors font-mono"
            >
              {exUrl.replace('https://', '')}
            </button>
          ))}
        </div>
      )}

      {/* Pipeline Progress */}
      <AnimatePresence>
        {loading && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="mt-6"
          >
            <AnalysisPipelineProgress
              stages={PIPELINE_STAGES}
              currentStage={stage}
              currentStageIndex={currentStageIndex}
              progress={progress}
              url={url}
              correlationId={jobInfo?.correlationId}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
