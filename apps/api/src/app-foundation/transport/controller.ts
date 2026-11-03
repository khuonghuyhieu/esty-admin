import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AppService } from '../application/service.js';
import { AppAuthGuard, requestContext } from './auth-guard.js';
import type { AppRequest } from './auth-guard.js';

@Controller('v1/app')
@UseGuards(AppAuthGuard)
export class AppController {
  constructor(private readonly service: AppService) {}

  @Get('me')
  me(@Req() request: AppRequest) {
    const { identity, signal } = requestContext(request);
    return this.service.me(identity, signal);
  }

  @Patch('me')
  updateProfile(@Req() request: AppRequest, @Body() body: unknown) {
    const { identity, requestId, signal } = requestContext(request);
    return this.service.updateProfile(identity, body, requestId, signal);
  }

  @Get('workspace')
  workspace(@Req() request: AppRequest) {
    const { identity, signal } = requestContext(request);
    return this.service.readWorkspace(identity, signal);
  }

  @Patch('workspace')
  updateWorkspace(@Req() request: AppRequest, @Body() body: unknown) {
    const { identity, requestId, signal } = requestContext(request);
    return this.service.updateWorkspace(identity, body, requestId, signal);
  }

  @Get('team')
  team(@Req() request: AppRequest, @Query() query: unknown) {
    const { identity, signal } = requestContext(request);
    return this.service.team(identity, query, signal);
  }

  @Patch('team/:memberId')
  updateMember(@Req() request: AppRequest, @Param('memberId') memberId: string, @Body() body: unknown) {
    const { identity, requestId, signal } = requestContext(request);
    return this.service.updateMember(identity, memberId, body, requestId, signal);
  }

  @Get('audit')
  audit(@Req() request: AppRequest, @Query() query: unknown) {
    const { identity, signal } = requestContext(request);
    return this.service.auditPage(identity, query, signal);
  }

  @Get('invitations')
  invitations(@Req() request: AppRequest, @Query() query: unknown) {
    const { identity, signal } = requestContext(request);
    return this.service.invitations(identity, query, signal);
  }

  @Post('invitations')
  @HttpCode(200)
  createInvitation(@Req() request: AppRequest, @Body() body: unknown) {
    const { identity, requestId, signal } = requestContext(request);
    return this.service.createInvitation(identity, body, requestId, signal);
  }

  @Post('invitations/:id/reinvite')
  @HttpCode(200)
  reinvite(@Req() request: AppRequest, @Param('id') id: string, @Body() body: unknown) {
    const { identity, requestId, signal } = requestContext(request);
    return this.service.createInvitation(identity, body, requestId, signal, id);
  }

  @Post('invitations/:id/revoke')
  @HttpCode(200)
  revoke(@Req() request: AppRequest, @Param('id') id: string, @Body() body: unknown) {
    const { identity, requestId, signal } = requestContext(request);
    return this.service.revokeInvitation(identity, id, body, requestId, signal);
  }

  @Post('invitations/:id/accept')
  @HttpCode(200)
  accept(@Req() request: AppRequest, @Param('id') id: string, @Body() body: unknown) {
    const { identity, requestId, signal } = requestContext(request);
    return this.service.acceptInvitation(identity, id, body, requestId, signal);
  }
}
