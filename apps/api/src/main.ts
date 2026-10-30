import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { configureApplication, createApplicationModule } from './app.js';
import { ConfigurationError, loadConfig } from './config/config.js';

try {
  const config = loadConfig();
  const app = await NestFactory.create(createApplicationModule(config), { logger: false, abortOnError: false });
  configureApplication(app, config);
  app.enableShutdownHooks(['SIGINT', 'SIGTERM']);
  try {
    await app.listen(config.port, config.host);
    console.info('Foundation API is listening.');
  } catch {
    await app.close();
    throw new Error('Unable to bind the API.');
  }
} catch (error) {
  console.error(error instanceof ConfigurationError ? error.message : 'API startup failed. Check configuration and port availability.');
  process.exitCode = 1;
}
