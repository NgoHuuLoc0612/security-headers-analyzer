// apps/api/src/common/interceptors/transform.interceptor.ts
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  timestamp: string;
  requestId?: string;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T> | T> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T> | T> {
    const request = context.switchToHttp().getRequest();
    const requestId = request.headers['x-request-id'] || request.headers['x-correlation-id'];

    // SSE (@Sse()) routes stream raw MessageEvent objects ({ data, type?, id?, retry? })
    // and must NEVER be wrapped, or EventSource on the client fails to parse them
    // and silently reconnects in a loop. Detect by URL since it's the most
    // reliable signal across Nest versions (internal SSE metadata keys are private API).
    const isSse: boolean = typeof request?.url === 'string' && /\/stream\//.test(request.url);

    return next.handle().pipe(
      map((data) => {
        if (isSse) return data;
        if (data && typeof data === 'object' && 'success' in data) return data;
        if (data instanceof Observable) return data;
        return {
          success: true,
          data,
          timestamp: new Date().toISOString(),
          requestId,
        };
      }),
    );
  }
}
