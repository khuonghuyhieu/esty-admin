import 'reflect-metadata';
import { createApplication } from './app.js';
import { ConfigurationError, loadConfig } from './config/config.js';

try {
  const config = loadConfig();
  const app = await createApplication(config);
  if (config.runtime === 'local') app.enableShutdownHooks(['SIGINT', 'SIGTERM']);
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
