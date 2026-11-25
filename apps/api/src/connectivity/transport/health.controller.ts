import { Controller, Get, Inject, Req, Res } from '@nestjs/common';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { components } from '../../generated/api.js';
import { ReadinessService } from '../application/readiness.js';

@Controller('health')
export class HealthController {
  constructor(@Inject(ReadinessService) private readonly readiness: ReadinessService) {}

  @Get('live')
  live(): components['schemas']['Liveness'] {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready(@Req() request: IncomingMessage, @Res({ passthrough: true }) response: ServerResponse): Promise<components['schemas']['Ready'] | components['schemas']['Degraded']> {
    const cancellation = new AbortController();
    const cancel = () => cancellation.abort();
    request.once('aborted', cancel);
    response.once('close', cancel);
    try {
      const state = await this.readiness.check(cancellation.signal);
      if (state !== 'current') {
        // Degraded health is a typed response, not an application error.
        response.statusCode = 503;
        response.setHeader('Cache-Control', 'private, no-store');
        return { status: 'degraded', reason: state };
      }
      return { status: 'ready', database: 'up', migrations: 'current' };
    } finally {
      request.removeListener('aborted', cancel);
      response.removeListener('close', cancel);
    }
  }
}
