// apps/web/src/lib/api/client.ts
const API_BASE = process.env.NEXT_PUBLIC_API_URL
  ? `${process.env.NEXT_PUBLIC_API_URL}/api/v1`
  : '/api/v1';

async function fetchJSON<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
    ...options,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || `HTTP ${res.status}`);
  }

  const json = await res.json();

  // Backend wraps all non-SSE responses as { success, data, timestamp, requestId }.
  // Unwrap here once so every caller can use the payload directly.
  if (json && typeof json === 'object' && 'success' in json && 'data' in json) {
    return json.data as T;
  }

  return json as T;
}

export const api = {
  // Analysis
  submitAnalysis: (url: string, options?: Record<string, unknown>) =>
    fetchJSON<any>('/analysis', {
      method: 'POST',
      body: JSON.stringify({ url, options }),
    }),

  getAnalysis: (id: string) =>
    fetchJSON<any>(`/analysis/${id}`),

  getByCorrelationId: (correlationId: string) =>
    fetchJSON<any>(`/analysis/correlation/${correlationId}`),

  listAnalyses: (params?: Record<string, unknown>) => {
    const qs = params ? '?' + new URLSearchParams(params as any).toString() : '';
    return fetchJSON<any>(`/analysis${qs}`);
  },

  getDomainHistory: (domain: string, limit = 50) =>
    fetchJSON<any>(`/analysis/domain/${encodeURIComponent(domain)}/history?limit=${limit}`),

  getDomainTrend: (domain: string, days = 30) =>
    fetchJSON<any>(`/analysis/domain/${encodeURIComponent(domain)}/trend?days=${days}`),

  compareAnalyses: (ids: string[]) =>
    fetchJSON<any>('/analysis/compare', { method: 'POST', body: JSON.stringify({ analysisIds: ids }) }),

  getTopDomains: (limit = 20) =>
    fetchJSON<any>(`/analysis/leaderboard/top?limit=${limit}`),

  getStats: () =>
    fetchJSON<any>('/analysis/stats/overview'),

  getJobStatus: (jobId: string) =>
    fetchJSON<any>(`/analysis/job/${jobId}/status`),

  cancelJob: (jobId: string) =>
    fetchJSON<any>(`/analysis/job/${jobId}/cancel`, { method: 'POST' }),

  exportAnalysis: (id: string, format: 'json' | 'csv') =>
    `${API_BASE}/analysis/${id}/export/${format}`,

  submitBulkAnalysis: (urls: string[], options?: Record<string, unknown>) =>
    fetchJSON<any>('/analysis/bulk', {
      method: 'POST',
      body: JSON.stringify({ urls, options }),
    }),

  // Queue
  getQueueMetrics: () => fetchJSON<any>('/queue/metrics'),

  // Metrics
  getSystemMetrics: () => fetchJSON<any>('/metrics/system'),
  getQueueStats: () => fetchJSON<any>('/metrics/queue'),

  // Health
  getHealth: () => fetchJSON<any>('/health'),
};

// SSE stream helper
export function createSSEStream(
  correlationId: string,
  onMessage: (event: any) => void,
  onError?: (err: Event) => void,
  onComplete?: () => void,
): () => void {
  const url = `${API_BASE}/analysis/stream/${correlationId}`;
  const es = new EventSource(url);

  es.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      onMessage(data);
      if (data?.type === 'job:completed' || data?.type === 'job:failed') {
        es.close();
        onComplete?.();
      }
    } catch {}
  };

  es.onerror = (err) => {
    onError?.(err);
  };

  return () => es.close();
}
