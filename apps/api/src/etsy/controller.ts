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
