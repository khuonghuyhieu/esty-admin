import { writeSync } from 'node:fs';
import type { INestApplication } from '@nestjs/common';
import type { ConfigurationError } from './config/config.js';

type StartupStage = 'entry' | 'config' | 'module-import' | 'NestFactory' | 'listen' | 'listening';
let stage: StartupStage = 'entry';
let configurationError: typeof ConfigurationError | undefined;

function mark(next: StartupStage): void {
  stage = next;
  writeSync(1, JSON.stringify({ event: 'startup_stage', stage }) + '\n');
}

function failure(error?: unknown, timeout?: 'STARTUP_TIMEOUT'): void {
  const errorClass = error instanceof Error
    ? configurationError && error instanceof configurationError ? 'ConfigurationError'
      : error instanceof TypeError ? 'TypeError' : error instanceof SyntaxError ? 'SyntaxError'
        : error instanceof ReferenceError ? 'ReferenceError' : error instanceof RangeError ? 'RangeError' : 'Error'
    : undefined;
  const candidate = error instanceof Error ? Object.getOwnPropertyDescriptor(error, 'code')?.value : undefined;
  const code = timeout ?? (typeof candidate === 'string' && [
    'ERR_MODULE_NOT_FOUND', 'MODULE_NOT_FOUND', 'ERR_REQUIRE_ESM', 'ERR_UNKNOWN_FILE_EXTENSION',
    'ERR_PACKAGE_PATH_NOT_EXPORTED', 'ERR_IMPORT_ATTRIBUTE_MISSING', 'ERR_DLOPEN_FAILED', 'EADDRINUSE', 'EACCES',
  ].includes(candidate) ? candidate : undefined);
  const candidateField = errorClass === 'ConfigurationError' ? (error as Error).message.split(':', 1)[0] : undefined;
  const field = candidateField && [
    'API_RUNTIME', 'VERCEL', 'PREVIEW_ACCESS_KEY', 'operator/deploy context', 'API_HOST/API_PORT', 'PORT', 'API_PORT',
    'API_HOST', 'BROWSER_ORIGIN', 'DATABASE_URL', 'DATABASE_CA_PEM', 'SUPABASE_PROJECT_REF',
    'SUPABASE_SESSION_HOST', 'SUPABASE_DATABASE_NAME', 'SUPABASE_DATABASE_USER', 'package.json', '.env',
  ].includes(candidateField) ? candidateField : undefined;
  // Only a known application filename and bounded line/column may leave a stack.
  const frame = error instanceof Error ? error.stack?.match(/\/src\/(main|app|config\/config|platform\/vercel|connectivity\/adapters\/postgres)\.js:(\d{1,6}):(\d{1,6})\)?(?:\n|$)/) : undefined;
  writeSync(2, JSON.stringify({ event: 'startup_failure', stage, errorClass, code, field,
    ...(frame ? { frame: `src/${frame[1]}.js:${frame[2]}:${frame[3]}` } : {}) }) + '\n');
}

mark('entry');
// Covers asynchronous imports, provider initialization, binding and failed-start
// cleanup. A blocked event loop or a platform failure before entry needs platform diagnostics.
const startupDeadline = setTimeout(() => {
  failure(undefined, 'STARTUP_TIMEOUT');
  process.exit(1);
}, 8000);

async function bootstrap(): Promise<void> {
  let app: INestApplication | undefined;
  try {
    // Static imports run before this guard. Dynamic imports deliberately keep
    // dependency evaluation failures inside the secret-safe startup boundary.
    mark('config');
    const configuration = await import('./config/config.js');
    configurationError = configuration.ConfigurationError;
    const config = configuration.loadConfig();
    mark('module-import');
    await import('reflect-metadata');
    const { NestFactory } = await import('@nestjs/core');
    const { configureApplication, createApplicationModule } = await import('./app.js');
    mark('NestFactory');
    app = await NestFactory.create(createApplicationModule(config), { logger: false, abortOnError: false });
    configureApplication(app, config);
    app.enableShutdownHooks(['SIGINT', 'SIGTERM']);
    mark('listen');
    // The managed bridge captures listen(), discards its callback, then binds
    // after module import. Only the real server event proves binding completed.
    app.getHttpServer().once('listening', () => {
      clearTimeout(startupDeadline);
      mark('listening');
    });
    await app.listen(config.port, config.host);
  } catch (error) {
    failure(error);
    try { await app?.close(); } catch { /* No raw cleanup errors. The original stage is retained. */ }
    clearTimeout(startupDeadline);
    process.exit(1);
  }
}

// Do not top-level-await: managed invocation must finish importing before binding.
void bootstrap();
