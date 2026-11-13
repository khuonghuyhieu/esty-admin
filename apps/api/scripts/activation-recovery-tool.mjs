import { isBuiltin, registerHooks } from 'node:module';
import { realpathSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const [rootArg, ...args] = process.argv.slice(2);
if (!rootArg || process.execArgv.length || process.env.NODE_OPTIONS || process.env.NODE_PATH) throw new Error('Recovery CLI identity differs.');
const root = realpathSync(rootArg), cli = join(root, 'vercel/dist/vc.js');
if (root !== resolve(rootArg) || realpathSync(cli) !== cli) throw new Error('Recovery CLI identity differs.');
registerHooks({ resolve(specifier, context, nextResolve) {
  const result = nextResolve(specifier, context);
  if (isBuiltin(result.url)) return result;
  if (!result.url.startsWith('file:')) throw new Error('Recovery CLI module escaped.');
  const path = realpathSync(fileURLToPath(result.url)), child = relative(root, path);
  if (!child || child === '..' || child.startsWith('../') || resolve(root, child) !== path) throw new Error('Recovery CLI module escaped.');
  return result;
} });
process.argv = [process.execPath, cli, ...args];
await import(pathToFileURL(cli).href);
