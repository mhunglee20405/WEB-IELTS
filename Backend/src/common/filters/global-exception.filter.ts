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
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { correlationId?: string }>();

    const correlationId =
      request.correlationId ||
      (request.headers['x-correlation-id'] as string) ||
      (request.headers['x-request-id'] as string);

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error = 'InternalServerError';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resp = exceptionResponse as Record<string, unknown>;
        message = (resp['message'] as string | string[]) || exception.message;
        error = (resp['error'] as string) || exception.name;
      } else {
        message = exception.message;
        error = exception.name;
      }
    } else if (exception instanceof Error) {
      this.logger.error(
        `[Correlation: ${correlationId || 'none'}] Unhandled error at ${request.method} ${request.url}: ${exception.message}`,
        exception.stack,
      );
      // In production, do not leak internal database errors or unhandled system errors
      if (process.env.NODE_ENV === 'production') {
        message = 'Internal server error';
        error = 'InternalServerError';
      } else {
        message = exception.message;
        error = exception.name;
      }
    }

    const out: Record<string, any> = {
      statusCode: status,
      error,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
      ...(correlationId ? { correlationId } : {}),
    };

    if (exception instanceof HttpException) {
      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resp = exceptionResponse as Record<string, unknown>;
        if (resp['code']) out.code = resp['code'];
        if (resp['errors']) out.errors = resp['errors'];
        if (resp['details']) out.details = resp['details'];
        if (resp['info']) out.info = resp['info'];
      }
    }

    response.status(status).json(out);
  }
}
