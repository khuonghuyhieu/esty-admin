import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { ApiConfig } from './config/config.js';
import { PostgresProbe } from './connectivity/adapters/postgres.js';
import { expectedMigrations } from './generated/migrations.js';
import { attachPlatformLifecycle } from './platform/vercel.js';
import { ReadinessService } from './connectivity/application/readiness.js';
import { HealthController } from './connectivity/transport/health.controller.js';
import { previewAccess } from './platform/preview-access.js';

export async function createApplication(config: ApiConfig, requiredMigrations = expectedMigrations) {
  @Module({
    controllers: [HealthController],
    providers: [
      { provide: PostgresProbe, useFactory: () => {
        const probe = new PostgresProbe(config.database, requiredMigrations, config.runtime === 'local' ? 4 : 2);
        attachPlatformLifecycle(config.runtime, probe.pool);
        return probe;
      } },
      { provide: ReadinessService, inject: [PostgresProbe], useFactory: (database: PostgresProbe) => new ReadinessService(database) },
    ],
  })
  class FoundationModule {}
  const app = await NestFactory.create(FoundationModule, { logger: false, abortOnError: false });
  if (config.runtime === 'vercel') app.use(previewAccess(config.previewAccessKey!, config.browserOrigin));
  app.enableCors({ origin: config.browserOrigin, methods: ['GET'], credentials: false });
  return app;
}
