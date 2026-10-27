import { Controller, Get, HttpException, Inject, Req, Res } from '@nestjs/common';
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
  async ready(@Req() request: IncomingMessage, @Res({ passthrough: true }) response: ServerResponse): Promise<components['schemas']['Ready']> {
    const cancellation = new AbortController();
    const cancel = () => cancellation.abort();
    request.once('aborted', cancel);
    response.once('close', cancel);
    try {
      const state = await this.readiness.check(cancellation.signal);
      if (state !== 'current') {
        const body: components['schemas']['Degraded'] = { status: 'degraded', reason: state };
        throw new HttpException(body, 503);
      }
      return { status: 'ready', database: 'up', migrations: 'current' };
    } finally {
      request.removeListener('aborted', cancel);
      response.removeListener('close', cancel);
    }
  }
}
