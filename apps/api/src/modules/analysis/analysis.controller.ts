// apps/api/src/modules/analysis/analysis.controller.ts
import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  Res,
  UseGuards,
  UsePipes,
  Version,
  Sse,
  MessageEvent,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { Observable } from 'rxjs';
import { AnalysisService } from './analysis.service';
import { ZodPipe } from '../../common/pipes/zod-validation.pipe';
import {
  AnalysisRequestSchema,
  BulkAnalysisSchema,
  PaginationQuerySchema,
  ComparisonSchema,
  TrendQuerySchema,
  type AnalysisRequestDto,
  type BulkAnalysisDto,
  type PaginationQueryDto,
  type ComparisonDto,
  type TrendQueryDto,
} from './dto/analysis.schema';
import { Throttle } from '@nestjs/throttler';

@ApiTags('analysis')
@Controller({ version: '1', path: 'analysis' })
export class AnalysisController {
  constructor(private readonly analysisService: AnalysisService) {}

  // ─── Submit single analysis ────────────────────────────────
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Submit URL for security analysis' })
  @ApiResponse({ status: 202, description: 'Analysis job queued' })
  @ApiResponse({ status: 422, description: 'Validation error' })
  @UsePipes(ZodPipe(AnalysisRequestSchema))
  async submitAnalysis(@Body() dto: AnalysisRequestDto) {
    return this.analysisService.submitAnalysis(dto);
  }

  // ─── Submit bulk analysis ──────────────────────────────────
  @Post('bulk')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Submit up to 50 URLs for bulk analysis' })
  @UsePipes(ZodPipe(BulkAnalysisSchema))
  async submitBulkAnalysis(@Body() dto: BulkAnalysisDto) {
    return this.analysisService.submitBulkAnalysis(dto);
  }

  // ─── SSE stream for realtime progress ─────────────────────
  @Sse('stream/:correlationId')
  @ApiOperation({ summary: 'SSE stream for analysis progress' })
  streamAnalysis(
    @Param('correlationId') correlationId: string,
  ): Observable<MessageEvent> {
    return this.analysisService.getProgressStream(correlationId);
  }

  // ─── Get analysis by ID ────────────────────────────────────
  @Get(':id')
  @ApiOperation({ summary: 'Get analysis result by ID' })
  @ApiResponse({ status: 200, description: 'Analysis result' })
  @ApiResponse({ status: 404, description: 'Not found' })
  async getAnalysis(@Param('id') id: string) {
    return this.analysisService.getAnalysisById(id);
  }

  // ─── Get analysis by correlation ID ───────────────────────
  @Get('correlation/:correlationId')
  @ApiOperation({ summary: 'Get analysis by correlation ID (job tracking)' })
  async getByCorrelationId(@Param('correlationId') correlationId: string) {
    return this.analysisService.getByCorrelationId(correlationId);
  }

  // ─── List analyses ─────────────────────────────────────────
  @Get()
  @ApiOperation({ summary: 'List analyses with filtering & pagination' })
  async listAnalyses(@Query() query: PaginationQueryDto) {
    const validated = PaginationQuerySchema.parse(query);
    return this.analysisService.listAnalyses(validated);
  }

  // ─── Domain history ────────────────────────────────────────
  @Get('domain/:domain/history')
  @ApiOperation({ summary: 'Get scan history for a domain' })
  async getDomainHistory(
    @Param('domain') domain: string,
    @Query('limit') limit = 50,
  ) {
    return this.analysisService.getDomainHistory(domain, Number(limit));
  }

  // ─── Trend analysis ────────────────────────────────────────
  @Get('domain/:domain/trend')
  @ApiOperation({ summary: 'Get trend data for a domain over time' })
  async getDomainTrend(
    @Param('domain') domain: string,
    @Query() query: TrendQueryDto,
  ) {
    const validated = TrendQuerySchema.parse({ ...query, domain });
    return this.analysisService.getDomainTrend(validated);
  }

  // ─── Compare multiple analyses ─────────────────────────────
  @Post('compare')
  @ApiOperation({ summary: 'Compare multiple analysis results' })
  @UsePipes(ZodPipe(ComparisonSchema))
  async compareAnalyses(@Body() dto: ComparisonDto) {
    return this.analysisService.compareAnalyses(dto.analysisIds);
  }

  // ─── Top domains ───────────────────────────────────────────
  @Get('leaderboard/top')
  @ApiOperation({ summary: 'Top domains by security score' })
  async getTopDomains(@Query('limit') limit = 20) {
    return this.analysisService.getTopDomains(Number(limit));
  }

  // ─── Stats ─────────────────────────────────────────────────
  @Get('stats/overview')
  @ApiOperation({ summary: 'Global analysis statistics' })
  async getStats() {
    return this.analysisService.getGlobalStats();
  }

  // ─── Job status ────────────────────────────────────────────
  @Get('job/:jobId/status')
  @ApiOperation({ summary: 'Get BullMQ job status' })
  async getJobStatus(@Param('jobId') jobId: string) {
    return this.analysisService.getJobStatus(jobId);
  }

  // ─── Cancel job ────────────────────────────────────────────
  @Post('job/:jobId/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a queued job' })
  async cancelJob(@Param('jobId') jobId: string) {
    return this.analysisService.cancelJob(jobId);
  }

  // ─── Export results ────────────────────────────────────────
  @Get(':id/export/:format')
  @ApiOperation({ summary: 'Export analysis results (json|csv|pdf)' })
  async exportAnalysis(
    @Param('id') id: string,
    @Param('format') format: 'json' | 'csv',
    @Res() res: Response,
  ) {
    const data = await this.analysisService.exportAnalysis(id, format);
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="analysis-${id}.csv"`);
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="analysis-${id}.json"`);
    }
    res.send(data);
  }
}
