import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AppAuthGuard, requestContext } from '../app-foundation/transport/auth-guard.js';
import type { AppRequest } from '../app-foundation/transport/auth-guard.js';
import { EtsyService } from './service.js';
import { AppError } from '../app-foundation/application/errors.js';

@Controller('v1/app/integrations/etsy')
@UseGuards(AppAuthGuard)
export class EtsyController {
  constructor(private readonly service: EtsyService) {}

  @Get()
  status(@Req() request: AppRequest, @Query() query: Record<string, unknown>) {
    const { identity, signal } = requestContext(request);
    if (Object.keys(query).length) throw new AppError('invalid_request');
    return this.service.status(identity, signal);
  }

  @Get('shops/lookup')
  lookup(@Req() request: AppRequest) {
    const { identity, signal } = requestContext(request);
    const raw = request.url ?? '', separator = raw.indexOf('?');
    const path = separator < 0 ? raw : raw.slice(0, separator), query = separator < 0 ? '' : raw.slice(separator + 1);
    if (request.method !== 'GET' || path !== '/v1/app/integrations/etsy/shops/lookup'
      || request.headers['transfer-encoding'] !== undefined
      || (request.headers['content-length'] !== undefined && request.headers['content-length'] !== '0')
      || Buffer.byteLength(query) > 1024 || /%(?![a-f0-9]{2})/i.test(query)) throw new AppError('invalid_request');
    const params = new URLSearchParams(query), keys = [...params.keys()];
    const name = params.get('shopName')?.replace(/^[\x09-\x0d\x20]+|[\x09-\x0d\x20]+$/g, '');
    const offset = params.get('offset') ?? '0';
    if (new Set(keys).size !== keys.length || keys.some(key => !['shopName', 'offset'].includes(key))
      || name === undefined || !/^[A-Za-z0-9]{1,64}$/.test(name) || !/^(0|20|40|60|80)$/.test(offset)) throw new AppError('invalid_request');
    return this.service.lookup(identity, name.toLowerCase(), Number(offset), signal);
  }

  @Get('invitations')
  invitations(@Req() request: AppRequest, @Query() query: unknown) {
    const { identity, signal } = requestContext(request);
    return this.service.invitations(identity, query, signal);
  }

  @Post('invitations')
  @HttpCode(200)
  create(@Req() request: AppRequest, @Body() body: unknown) {
    const { identity, signal } = requestContext(request);
    return this.service.createInvitation(identity, body, signal);
  }

  @Post('invitations/:id/cancel')
  @HttpCode(200)
  cancel(@Req() request: AppRequest, @Param('id') id: string, @Body() body: unknown) {
    const { identity, signal } = requestContext(request);
    return this.service.manage(identity, 'cancel', id, body, signal);
  }

  @Post('disconnect')
  @HttpCode(200)
  disconnect(@Req() request: AppRequest, @Body() body: unknown) {
    const { identity, signal } = requestContext(request);
    return this.service.manage(identity, 'disconnect', null, body, signal);
  }

  @Post('read')
  @HttpCode(200)
  read(@Req() request: AppRequest, @Body() body: unknown) {
    const { identity, signal } = requestContext(request);
    return this.service.read(identity, body, signal);
  }
}
