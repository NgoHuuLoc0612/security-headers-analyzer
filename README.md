# 🛡️ Security Headers Analyzer

> Queue-based security headers analysis platform with realtime
> streaming, 3D/2D visualizations, and a fully specialized multi-worker pipeline.

No Docker. No shortcuts. Real architecture, real workers, real queues.

---

## Architecture

```
Next.js (UI + Dashboard)
        ↓
NestJS API Gateway (Zod validation)
        ↓
Job Orchestrator (BullMQ FlowProducer — fan-out/fan-in)
        ↓
Redis (Memurai) — cache + queue state + pub/sub
        ↓
Worker Pool (specialized, horizontally scaled)
   ┌─────────────────────────────────────────┐
   │  IO Workers   — Undici HTTP fetch, DNS    │
   │  API Workers  — SSL Labs, VirusTotal, RDAP│
   │  CPU Workers  — Rule engine, scoring      │
   └─────────────────────────────────────────┘
        ↓
Data Enrichment Layer (Undici / SSL Labs / VirusTotal / RDAP)
        ↓
Processing Layer (Rule Engine + Scoring Service)
        ↓
Prisma ORM
        ↓
PostgreSQL (EDB native)
        ↓
Next.js + D3.js + Three.js visualization
```

## Multi-Worker Queue Architecture

| Feature | Implementation |
|---|---|
| **Worker specialization** | `IoWorker`, `CpuWorker`, `ApiWorker` — separate BullMQ processors, separate queues |
| **Horizontal scaling** | `cluster` module forks 1 process per CPU core (`ENABLE_CLUSTER=true`) |
| **Fan-out / fan-in** | `FlowProducer` creates parent/child job graphs; `ResultAggregatorWorker` fans back in |
| **Backpressure control** | Queue depth thresholds reject new submissions (`MAX_WAITING_IO/CPU/API`) |
| **Retry + DLQ** | Exponential backoff (3-4 attempts) → dedicated `dlq:io` / `dlq:cpu` / `dlq:api` queues |
| **Idempotent jobs** | Redis `SET NX` idempotency keys (60s window) prevent duplicate submissions |
| **Cluster-level scaling** | `MAX_CLUSTER_WORKERS` env var, auto-restart on crash |
| **Queue-level scaling** | Each queue independently configurable (concurrency, rate limiter) |
| **Concurrency level** | IO=20, CPU=4, API=8 (rate-limited to 10 req/s per worker) |

## Tech Stack

- **Frontend**: Next.js 14 (App Router), Tailwind CSS, D3.js, Three.js (`@react-three/fiber`), Framer Motion
- **Backend**: NestJS, Zod validation, BullMQ, ioredis
- **Database**: PostgreSQL (EDB native) via Prisma ORM
- **Cache/Queue**: Redis (Memurai-compatible)
- **HTTP Client**: Undici (connection pooling, HTTP/2)
- **External APIs**: SSL Labs API, VirusTotal API v3, RDAP (IANA bootstrap)

## Visualizations

| Type | Component | Library |
|---|---|---|
| Radar chart | `radar-chart-panel.tsx` | D3.js |
| Treemap | `treemap-panel.tsx` | D3.js |
| Sunburst | `csp-panel.tsx` | D3.js |
| Force-directed graph | `dns-panel.tsx` | D3.js |
| Pie/donut gauge | `reputation-panel.tsx`, `score-hero.tsx` | D3.js |
| Line/area trend | `trend-chart.tsx` | D3.js |
| Heatmap calendar | `global-score-heatmap.tsx` | D3.js |
| Grouped bar chart | `comparison-chart.tsx` | D3.js |
| Animated pipeline diagram | `realtime-pipeline.tsx` | D3.js (SVG + transitions) |
| **3D Globe** | `globe-3d-panel.tsx` | Three.js / react-three-fiber |
| Realtime SSE progress | `analysis-pipeline-progress.tsx` | Server-Sent Events |

## Project Structure

```
security-headers-analyzer/
├── apps/
│   ├── api/                  # NestJS backend
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── analysis/       # Controller, service, Zod DTOs
│   │   │   │   ├── queue/          # JobOrchestrator, BullMQ constants
│   │   │   │   ├── workers/        # IoWorker, CpuWorker, ApiWorker, ResultAggregator
│   │   │   │   │   └── services/   # RuleEngine, Scoring, CSPAnalyzer, CookieAnalyzer
│   │   │   │   ├── websocket/      # Socket.IO realtime gateway
│   │   │   │   ├── metrics/        # Prometheus metrics
│   │   │   │   └── health/         # Terminus health checks
│   │   │   ├── database/           # Prisma + Redis services
│   │   │   ├── common/             # Pipes, filters, interceptors
│   │   │   └── main.ts             # Cluster bootstrap
│   │   └── prisma/schema.prisma    # PostgreSQL schema
│   └── web/                  # Next.js frontend
│       └── src/
│           ├── app/                # App Router pages
│           ├── components/
│           │   ├── analysis/       # Hero analyzer, panels (CSP/TLS/DNS/3D/etc)
│           │   ├── dashboard/      # Stats, leaderboard, pipeline viz
│           │   └── layout/         # Header, theme provider
│           └── lib/                # API client, utils
└── packages/
    └── types/             # Shared TypeScript types
```

## Setup

### Prerequisites
- Node.js 20+
- PostgreSQL (EDB native or standard PostgreSQL)
- Redis or Memurai (Windows)

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
# Edit DATABASE_URL, REDIS_HOST, SSL_LABS_EMAIL, VIRUSTOTAL_API_KEY
```

### 3. Setup database
```bash
npm run db:generate
npm run db:migrate
npm run db:seed   # optional sample data
```

### 4. Run development servers
```bash
npm run dev
# API:  http://localhost:3001
# Web:  http://localhost:3000
# Docs: http://localhost:3001/api/docs (Swagger)
```

### 5. Enable cluster mode (production)
```bash
ENABLE_CLUSTER=true MAX_CLUSTER_WORKERS=4 npm run start --workspace=apps/api
```

## API Endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/api/v1/analysis` | Submit URL for analysis |
| POST | `/api/v1/analysis/bulk` | Submit up to 50 URLs |
| GET | `/api/v1/analysis/stream/:correlationId` | SSE realtime progress |
| GET | `/api/v1/analysis/:id` | Get analysis result |
| GET | `/api/v1/analysis/domain/:domain/trend` | Historical trend |
| POST | `/api/v1/analysis/compare` | Compare multiple analyses |
| GET | `/api/v1/queue/metrics` | Queue depth/throughput metrics |
| GET | `/api/v1/metrics/prometheus` | Prometheus exposition |
| GET | `/api/v1/health` | Full health check (DB + Redis) |

## Security Headers Analyzed

CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy,
Permissions-Policy, COOP, COEP, X-XSS-Protection, Cache-Control,
Clear-Site-Data, plus full cookie security analysis (HttpOnly/Secure/SameSite,
`__Secure-`/`__Host-` prefix validation) and TLS vulnerability scanning
(Heartbleed, POODLE, BEAST, FREAK, Logjam, DROWN, ROBOT, Ticketbleed).

## Compliance Frameworks

PCI DSS · GDPR · HIPAA · OWASP Secure Headers Project · NIST SP 800-44 · CIS Benchmark
