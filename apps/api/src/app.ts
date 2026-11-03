import 'reflect-metadata';
import { Module } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import type { ApiConfig } from './config/config.js';
import { PostgresProbe } from './connectivity/adapters/postgres.js';
import { expectedMigrations } from './generated/migrations.js';
import { attachPlatformLifecycle } from './platform/vercel.js';
import { ReadinessService } from './connectivity/application/readiness.js';
import { HealthController } from './connectivity/transport/health.controller.js';
import { previewAccess } from './platform/preview-access.js';
import { AppDatabase } from './app-foundation/adapters/postgres.js';
import { AuthVerifier } from './app-foundation/adapters/auth-verifier.js';
import { AuthAdmin } from './app-foundation/adapters/auth-admin.js';
import { AppService } from './app-foundation/application/service.js';
import { AppController } from './app-foundation/transport/controller.js';
import { AppAuthGuard } from './app-foundation/transport/auth-guard.js';
import { AppErrorFilter } from './app-foundation/transport/error-filter.js';

export function createApplicationModule(config: ApiConfig, requiredMigrations = expectedMigrations) {
  @Module({
    controllers: config.appFoundation ? [HealthController, AppController] : [HealthController],
    providers: [
      { provide: PostgresProbe, useFactory: () => {
        const probe = new PostgresProbe(config.database, requiredMigrations, config.runtime === 'local' ? 4 : 2,
          config.runtime === 'vercel');
        attachPlatformLifecycle(config.runtime, probe.pool);
        return probe;
      } },
      { provide: ReadinessService, inject: [PostgresProbe], useFactory: (database: PostgresProbe) => new ReadinessService(database) },
      ...(config.appFoundation ? [
        { provide: AppDatabase, inject: [PostgresProbe], useFactory: (probe: PostgresProbe) => new AppDatabase(probe.pool) },
        { provide: AuthVerifier, useFactory: () => new AuthVerifier(config.appFoundation!) },
        { provide: AuthAdmin, useFactory: () => new AuthAdmin(config.appFoundation!) },
        { provide: AppService, inject: [AppDatabase, AuthAdmin],
          useFactory: (database: AppDatabase, auth: AuthAdmin) => new AppService(config.appFoundation!, database, auth) },
        AppAuthGuard,
      ] : []),
    ],
  })
  class FoundationModule {}
  return FoundationModule;
}

export function configureApplication(app: INestApplication, config: ApiConfig): void {
  if (config.runtime === 'vercel' || config.appFoundation) app.use(previewAccess(config.previewAccessKey!, config.browserOrigin));
  if (config.appFoundation) app.useGlobalFilters(new AppErrorFilter());
  app.enableCors({ origin: config.browserOrigin, methods: ['GET'], credentials: false });
}
