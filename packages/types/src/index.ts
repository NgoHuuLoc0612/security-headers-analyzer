// ============================================================
// Security Headers Analyzer — Shared Types
// ============================================================

// ─── Job & Queue ─────────────────────────────────────────────
export type JobStatus =
  | 'queued'
  | 'active'
  | 'completed'
  | 'failed'
  | 'delayed'
  | 'paused'
  | 'dead';

export type WorkerType = 'io' | 'cpu' | 'api';

export interface JobMeta {
  jobId: string;
  correlationId: string;
  submittedAt: string;
  startedAt?: string;
  completedAt?: string;
  attempts: number;
  maxAttempts: number;
  workerType: WorkerType;
  status: JobStatus;
  progress: number;
  stage: PipelineStage;
  error?: string;
}

export type PipelineStage =
  | 'QUEUED'
  | 'DNS_RESOLUTION'
  | 'TLS_HANDSHAKE'
  | 'HTTP_FETCH'
  | 'SSL_LABS'
  | 'VIRUS_TOTAL'
  | 'RDAP'
  | 'RULE_ENGINE'
  | 'SCORING'
  | 'PERSISTING'
  | 'COMPLETE'
  | 'FAILED';

// ─── Analysis Request ─────────────────────────────────────────
export interface AnalysisRequest {
  url: string;
  options?: {
    followRedirects?: boolean;
    maxRedirects?: number;
    timeoutMs?: number;
    includeSSLGrade?: boolean;
    includeVirusTotal?: boolean;
    includeRDAP?: boolean;
    includeSubresourceAnalysis?: boolean;
    includeCookieAnalysis?: boolean;
    includeCSPAnalysis?: boolean;
    priority?: 'low' | 'normal' | 'high' | 'critical';
  };
}

// ─── Security Headers ────────────────────────────────────────
export type HeaderSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type HeaderStatus = 'present' | 'missing' | 'misconfigured' | 'deprecated';

export interface HeaderAnalysis {
  name: string;
  value: string | null;
  status: HeaderStatus;
  severity: HeaderSeverity;
  score: number;
  maxScore: number;
  recommendation: string;
  details: string;
  references: string[];
  cweIds?: string[];
  owaspCategory?: string;
  directiveAnalysis?: DirectiveAnalysis[];
}

export interface DirectiveAnalysis {
  directive: string;
  value: string;
  valid: boolean;
  severity: HeaderSeverity;
  message: string;
}

// ─── CSP Analysis ────────────────────────────────────────────
export interface CSPAnalysis {
  raw: string | null;
  parsed: Record<string, string[]>;
  grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F' | 'N/A';
  score: number;
  unsafeDirectives: string[];
  missingDirectives: string[];
  wildcardSources: string[];
  nonces: string[];
  hashes: string[];
  violations: CSPViolation[];
  bypassRisks: string[];
  reportingEnabled: boolean;
  strictMode: boolean;
}

export interface CSPViolation {
  directive: string;
  source: string;
  severity: HeaderSeverity;
  message: string;
}

// ─── SSL/TLS ─────────────────────────────────────────────────
export interface TLSInfo {
  grade: string;
  gradeDetails?: string;
  hasWarnings: boolean;
  isExceptional: boolean;
  protocol: string;
  certValid: boolean;
  certExpiry: string;
  certIssuer: string;
  certSubject: string;
  certSAN: string[];
  certKeyStrength: number;
  certSignatureAlgorithm: string;
  certTransparency: boolean;
  hsts: boolean;
  hstsMaxAge: number;
  hstsIncludeSubdomains: boolean;
  hstsPreload: boolean;
  forwardSecrecy: string;
  vulnerabilities: TLSVulnerability[];
  cipherSuites: CipherSuite[];
  protocols: TLSProtocol[];
  ocspStapling: boolean;
  sessionResumption: string;
  compressionEnabled: boolean;
  heartbleed: boolean;
  poodle: boolean;
  beast: boolean;
  freak: boolean;
  logjam: boolean;
  drowned: boolean;
  robot: boolean;
  ticketbleed: boolean;
  zombie_poodle: boolean;
  golden_doodle: boolean;
}

export interface TLSVulnerability {
  name: string;
  severity: HeaderSeverity;
  description: string;
  cve?: string;
  cvss?: number;
  remediation: string;
}

export interface CipherSuite {
  name: string;
  strength: 'strong' | 'acceptable' | 'weak' | 'insecure';
  protocol: string;
  keyExchange: string;
  authentication: string;
  encryption: string;
  mac: string;
}

export interface TLSProtocol {
  name: string;
  version: string;
  enabled: boolean;
  secure: boolean;
}

// ─── VirusTotal ──────────────────────────────────────────────
export interface VirusTotalResult {
  url: string;
  domain: string;
  reputation: number;
  malicious: number;
  suspicious: number;
  clean: number;
  undetected: number;
  timeout: number;
  totalEngines: number;
  categories: Record<string, string>;
  lastAnalysisDate: string;
  firstSubmissionDate: string;
  lastModificationDate: string;
  timesSubmitted: number;
  tags: string[];
  threatNames: string[];
  crowdsourcedContext?: string[];
  domainInfo?: {
    registrar: string;
    creationDate: string;
    expirationDate: string;
    lastUpdateDate: string;
    nameServers: string[];
    dnssec: boolean;
    lastHttpsCertificate?: Record<string, unknown>;
  };
}

// ─── RDAP ─────────────────────────────────────────────────────
export interface RDAPResult {
  domain: string;
  handle: string;
  ldhName: string;
  status: string[];
  events: RDAPEvent[];
  entities: RDAPEntity[];
  nameservers: string[];
  secureDNS?: {
    zoneSigned: boolean;
    delegationSigned: boolean;
    dsData?: unknown[];
  };
  links: string[];
  notices: string[];
  registrarIANAId?: string;
  registrar?: string;
  createdDate?: string;
  updatedDate?: string;
  expiresDate?: string;
  abuseContact?: string;
  ageInDays?: number;
  isDomainFresh?: boolean;
}

export interface RDAPEvent {
  eventAction: string;
  eventDate: string;
}

export interface RDAPEntity {
  handle: string;
  roles: string[];
  vcardArray?: unknown;
  email?: string;
}

// ─── DNS ──────────────────────────────────────────────────────
export interface DNSInfo {
  ipv4: string[];
  ipv6: string[];
  mx: DNSRecord[];
  txt: string[];
  cname: string | null;
  ns: string[];
  dmarc: string | null;
  spf: string | null;
  dkim: string | null;
  caa: string[];
  dnssec: boolean;
  rdns: Record<string, string>;
  asn: ASNInfo[];
  geolocation: IPGeolocation[];
}

export interface DNSRecord {
  priority: number;
  exchange: string;
}

export interface ASNInfo {
  ip: string;
  asn: string;
  org: string;
  country: string;
  route: string;
}

export interface IPGeolocation {
  ip: string;
  country: string;
  countryCode: string;
  region: string;
  city: string;
  lat: number;
  lon: number;
  isp: string;
  timezone: string;
}

// ─── Cookies ──────────────────────────────────────────────────
export interface CookieAnalysis {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None' | null;
  expires?: string;
  maxAge?: number;
  issues: CookieIssue[];
  risk: HeaderSeverity;
  score: number;
}

export interface CookieIssue {
  type: string;
  severity: HeaderSeverity;
  message: string;
  recommendation: string;
}

// ─── Scoring ──────────────────────────────────────────────────
export type SecurityGrade = 'A+' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

export interface SecurityScore {
  overall: number;
  grade: SecurityGrade;
  categories: {
    headers: CategoryScore;
    tls: CategoryScore;
    csp: CategoryScore;
    cookies: CategoryScore;
    dns: CategoryScore;
    reputation: CategoryScore;
  };
  breakdown: ScoreBreakdown[];
  improvements: Improvement[];
  riskProfile: RiskProfile;
  complianceStatus: ComplianceStatus;
  percentile?: number;
  industryAverage?: number;
}

export interface CategoryScore {
  score: number;
  maxScore: number;
  weight: number;
  grade: SecurityGrade;
  label: string;
  color: string;
}

export interface ScoreBreakdown {
  category: string;
  item: string;
  score: number;
  maxScore: number;
  impact: 'critical' | 'high' | 'medium' | 'low';
  status: HeaderStatus;
}

export interface Improvement {
  priority: number;
  category: string;
  header: string;
  action: string;
  impact: string;
  effort: 'trivial' | 'low' | 'medium' | 'high';
  scoreGain: number;
  codeExample?: string;
  references: string[];
}

export interface RiskProfile {
  xssRisk: HeaderSeverity;
  clickjackingRisk: HeaderSeverity;
  mitmRisk: HeaderSeverity;
  dataLeakageRisk: HeaderSeverity;
  codeInjectionRisk: HeaderSeverity;
  cryptoRisk: HeaderSeverity;
  overallRisk: HeaderSeverity;
}

export interface ComplianceStatus {
  pciDss: ComplianceCheck;
  gdpr: ComplianceCheck;
  hipaa: ComplianceCheck;
  owasp: ComplianceCheck;
  nist: ComplianceCheck;
  cis: ComplianceCheck;
}

export interface ComplianceCheck {
  compliant: boolean;
  score: number;
  issues: string[];
  recommendations: string[];
}

// ─── HTTP Info ───────────────────────────────────────────────
export interface HTTPInfo {
  url: string;
  finalUrl: string;
  statusCode: number;
  statusText: string;
  redirectChain: RedirectHop[];
  timing: RequestTiming;
  serverTechnology: string[];
  framework?: string;
  cdn?: string;
  waf?: string;
  compression: string | null;
  http2: boolean;
  http3: boolean;
  rawHeaders: Record<string, string>;
  securityHeaders: Record<string, string>;
  responseSize: number;
  transferSize: number;
}

export interface RedirectHop {
  url: string;
  statusCode: number;
  location?: string;
  isHttpToHttps?: boolean;
  hasSTS?: boolean;
}

export interface RequestTiming {
  dns: number;
  connect: number;
  tls: number;
  ttfb: number;
  transfer: number;
  total: number;
}

// ─── Full Analysis Result ─────────────────────────────────────
export interface AnalysisResult {
  id: string;
  url: string;
  domain: string;
  analyzedAt: string;
  duration: number;
  http: HTTPInfo;
  headers: HeaderAnalysis[];
  csp: CSPAnalysis;
  tls: TLSInfo | null;
  cookies: CookieAnalysis[];
  dns: DNSInfo;
  virusTotal: VirusTotalResult | null;
  rdap: RDAPResult | null;
  score: SecurityScore;
  jobMeta: JobMeta;
  rawData?: Record<string, unknown>;
}

// ─── Realtime Events ─────────────────────────────────────────
export type SSEEventType =
  | 'job:created'
  | 'job:started'
  | 'job:progress'
  | 'job:stage'
  | 'job:completed'
  | 'job:failed'
  | 'worker:active'
  | 'queue:metrics'
  | 'system:health';

export interface SSEEvent<T = unknown> {
  type: SSEEventType;
  correlationId: string;
  timestamp: string;
  data: T;
}

export interface ProgressEvent {
  stage: PipelineStage;
  progress: number;
  message: string;
  subStage?: string;
}

// ─── Queue Metrics ───────────────────────────────────────────
export interface QueueMetrics {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
  workers: WorkerMetric[];
  throughput: number;
  avgProcessingTime: number;
  errorRate: number;
  deadLetterCount: number;
}

export interface WorkerMetric {
  id: string;
  type: WorkerType;
  pid: number;
  status: 'idle' | 'busy' | 'error';
  currentJob?: string;
  processedCount: number;
  errorCount: number;
  uptime: number;
  memoryUsage: number;
  cpuUsage: number;
}

// ─── Historical / Trend ──────────────────────────────────────
export interface HistoricalDataPoint {
  timestamp: string;
  score: number;
  grade: SecurityGrade;
  url: string;
}

export interface TrendData {
  domain: string;
  dataPoints: HistoricalDataPoint[];
  trend: 'improving' | 'degrading' | 'stable';
  changePercent: number;
  firstScan: string;
  lastScan: string;
  totalScans: number;
}

// ─── Comparison ──────────────────────────────────────────────
export interface ComparisonResult {
  sites: {
    url: string;
    score: SecurityScore;
    grade: SecurityGrade;
    analysisId: string;
  }[];
  winner?: string;
  categoryWinners: Record<string, string>;
}

// ─── Visualization Config ────────────────────────────────────
export type VisualizationType =
  | 'radar'
  | 'treemap'
  | 'sunburst'
  | 'force-graph'
  | 'heatmap'
  | 'timeline'
  | 'gauge'
  | 'chord'
  | 'sankey'
  | 'globe-3d'
  | 'network-3d'
  | 'cylinder-3d'
  | 'pipeline-flow'
  | 'risk-matrix'
  | 'waterfall'
  | 'parallel-coords'
  | 'bubble-chart'
  | 'violin'
  | 'stream-graph';
