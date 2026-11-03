import { Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { AuthVerifier } from '../adapters/auth-verifier.js';
import type { VerifiedIdentity } from '../adapters/auth-verifier.js';
import { AppError } from '../application/errors.js';

export interface AppRequest extends IncomingMessage {
  foundation?: { identity: VerifiedIdentity; requestId: string; signal: AbortSignal };
}

@Injectable()
export class AppAuthGuard implements CanActivate {
  constructor(private readonly verifier: AuthVerifier) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AppRequest>();
    const response = context.switchToHttp().getResponse<ServerResponse>();
    response.setHeader('Cache-Control', 'private, no-store');
    const operation = new AbortController();
    const deadline = setTimeout(() => operation.abort(), 8000);
    const cleanup = () => {
      clearTimeout(deadline);
      request.removeListener('aborted', abort);
      response.removeListener('close', close);
      response.removeListener('finish', cleanup);
    };
    const abort = () => operation.abort();
    const close = () => { if (!response.writableEnded) abort(); cleanup(); };
    request.once('aborted', abort);
    response.once('close', close);
    response.once('finish', cleanup);
    let count = 0;
    for (let index = 0; index < request.rawHeaders.length; index += 2) {
      if (request.rawHeaders[index]?.toLowerCase() === 'x-app-access-token') count++;
    }
    const token = request.headers['x-app-access-token'];
    if (count !== 1 || typeof token !== 'string') throw new AppError('unauthenticated');
    const identity = await this.verifier.verify(token, operation.signal);
    request.foundation = { identity, requestId: randomUUID(), signal: operation.signal };
    return true;
  }
}

export function requestContext(request: AppRequest) {
  if (!request.foundation) throw new AppError('unauthenticated');
  return request.foundation;
}
