import { Catch, HttpException } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { AppError } from '../application/errors.js';
import type { AppRequest } from './auth-guard.js';

@Catch()
export class AppErrorFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void {
    const request = host.switchToHttp().getRequest<AppRequest>();
    const response = host.switchToHttp().getResponse<ServerResponse>();
    if (response.destroyed || response.writableEnded) return;
    const status = error instanceof AppError ? error.status : error instanceof HttpException
      ? error.getStatus() : 503;
    const code = error instanceof AppError ? error.code : status === 404 ? 'not_found'
      : status >= 400 && status < 500 ? 'invalid_request' : 'dependency_unavailable';
    response.statusCode = status;
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('Cache-Control', 'private, no-store');
    response.end(JSON.stringify({ code, requestId: request.foundation?.requestId ?? randomUUID() }));
  }
}
