// apps/api/src/common/filters/global-exception.filter.ts
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errors: unknown[] = [];

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === 'object') {
        message = (exceptionResponse as any).message || message;
        errors = (exceptionResponse as any).errors || [];
      } else {
        message = exceptionResponse;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      if (process.env.NODE_ENV !== 'production') {
        this.logger.error(exception.stack);
      }
    }

    const body = {
      statusCode: status,
      message,
      errors: errors.length ? errors : undefined,
      path: request.url,
      method: request.method,
      timestamp: new Date().toISOString(),
      correlationId: request.headers['x-correlation-id'],
    };

    if (status >= 500) {
      this.logger.error(`${request.method} ${request.url} → ${status}: ${message}`);
    }

    response.status(status).json(body);
  }
}
