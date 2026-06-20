// apps/api/src/modules/analysis/dto/analysis.schema.ts
import { z } from 'zod';

const urlSchema = z
  .string()
  .trim()
  .min(1, 'URL is required')
  .max(2048, 'URL too long')
  .refine((val) => {
    try {
      const url = new URL(val.startsWith('http') ? val : `https://${val}`);
      return ['http:', 'https:'].includes(url.protocol);
    } catch {
      return false;
    }
  }, 'Invalid URL format');

export const AnalysisRequestSchema = z.object({
  url: urlSchema,
  options: z
    .object({
      followRedirects: z.boolean().default(true),
      maxRedirects: z.number().int().min(0).max(20).default(10),
      timeoutMs: z.number().int().min(1000).max(120000).default(30000),
      includeSSLGrade: z.boolean().default(true),
      includeVirusTotal: z.boolean().default(true),
      includeRDAP: z.boolean().default(true),
      includeSubresourceAnalysis: z.boolean().default(false),
      includeCookieAnalysis: z.boolean().default(true),
      includeCSPAnalysis: z.boolean().default(true),
      priority: z.enum(['low', 'normal', 'high', 'critical']).default('normal'),
    })
    .optional()
    .default({}),
});

export const BulkAnalysisSchema = z.object({
  urls: z.array(urlSchema).min(1).max(50, 'Max 50 URLs per bulk request'),
  options: AnalysisRequestSchema.shape.options,
});

export const GetAnalysisParamsSchema = z.object({
  id: z.string().uuid('Invalid analysis ID'),
});

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  domain: z.string().optional(),
  grade: z.enum(['A+', 'A', 'B', 'C', 'D', 'E', 'F']).optional(),
  minScore: z.coerce.number().min(0).max(100).optional(),
  maxScore: z.coerce.number().min(0).max(100).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  sortBy: z.enum(['analyzedAt', 'overallScore', 'grade', 'domain']).default('analyzedAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const ComparisonSchema = z.object({
  analysisIds: z.array(z.string().uuid()).min(2).max(10),
});

export const TrendQuerySchema = z.object({
  domain: z.string().min(1),
  days: z.coerce.number().int().min(1).max(365).default(30),
});

export type AnalysisRequestDto = z.infer<typeof AnalysisRequestSchema>;
export type BulkAnalysisDto = z.infer<typeof BulkAnalysisSchema>;
export type PaginationQueryDto = z.infer<typeof PaginationQuerySchema>;
export type ComparisonDto = z.infer<typeof ComparisonSchema>;
export type TrendQueryDto = z.infer<typeof TrendQuerySchema>;
