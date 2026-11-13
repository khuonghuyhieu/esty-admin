import { createHash } from 'node:crypto';
import { constants, closeSync, fstatSync, lstatSync, openSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isBuiltin, registerHooks } from 'node:module';

const maximumFile = 64 * 1024 * 1024, maximumTree = 300 * 1024 * 1024;
const entry = 'apps/api/build/scripts/activation-input-helper.js';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const canonical = value => JSON.stringify(value);
function refuse() { throw new Error('Helper executable identity differs.'); }
function plainFile(path, maximum = maximumFile, owner = process.getuid()) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = fstatSync(fd);
    if (!info.isFile() || info.size > maximum || info.uid !== owner || (info.mode & 0o022)) refuse();
    const bytes = readFileSync(fd);
    if (bytes.length !== info.size) refuse();
    return { bytes, mode: info.mode & 0o777 };
  } finally { closeSync(fd); }
}
export function executableInventory(root) {
  root = resolve(root);
  if (realpathSync(root) !== root) refuse();
  const files = [], directories = [];
  let total = 0;
  function walk(directory) {
    const info = lstatSync(directory);
    if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid() || (info.mode & 0o022)) refuse();
    directories.push({ path: relative(root, directory).split('\\').join('/'), mode: info.mode & 0o777 });
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name), stat = lstatSync(path);
      if (stat.isSymbolicLink()) refuse();
      if (stat.isDirectory()) walk(path);
      else {
        const file = plainFile(path); total += file.bytes.length;
        if (total > maximumTree) refuse();
        files.push({ path: relative(root, path).split('\\').join('/'), mode: file.mode, size: file.bytes.length, sha256: hash(file.bytes) });
      }
    }
  }
  walk(root);
  return { files, directories };
}
export function verifyExecutable(root, manifestPath, approvedDigest) {
  if (!/^[a-f0-9]{64}$/.test(approvedDigest)) refuse();
  const manifestFile = plainFile(manifestPath, 8 * 1024 * 1024);
  if (hash(manifestFile.bytes) !== approvedDigest) refuse();
  const manifest = JSON.parse(manifestFile.bytes.toString('utf8'));
  if (manifest.version !== 2 || manifest.entry !== entry || manifest.launcher !== 'launch.mjs'
    || !Array.isArray(manifest.runtimes) || manifest.runtimes.length < 1 || manifest.runtimes.length > 2) refuse();
  const identities = new Set();
  for (const runtime of manifest.runtimes) {
    if (!runtime || Object.keys(runtime).sort().join(',') !== 'arch,platform,sha256,version'
      || runtime.version !== '24.22.1' || !/^[a-f0-9]{64}$/.test(runtime.sha256)
      || !['darwin/arm64', 'linux/x64'].includes(`${runtime.platform}/${runtime.arch}`)
      || identities.has(`${runtime.platform}/${runtime.arch}`)) refuse();
    identities.add(`${runtime.platform}/${runtime.arch}`);
  }
  const runtime = manifest.runtimes.find(runtime => runtime.platform === process.platform && runtime.arch === process.arch);
  // Only the pinned Linux runtime is root-owned; payload and manifest remain caller-owned.
  if (!runtime || runtime.version !== process.versions.node
    || runtime.sha256 !== hash(plainFile(realpathSync(process.execPath), maximumTree, process.platform === 'linux' ? 0 : process.getuid()).bytes)) refuse();
  const actual = executableInventory(root);
  if (canonical(actual.files) !== canonical(manifest.files) || canonical(actual.directories) !== canonical(manifest.directories)
    || !actual.files.some(file => file.path === entry) || !actual.files.some(file => file.path === manifest.launcher)) refuse();
  return manifest;
}
export function guardedOwnerCommand(runtime, launcher, runtimeHash, launcherHash, manifestPath, digest, args) {
  if (![runtimeHash, launcherHash, digest].every(value => /^[a-f0-9]{64}$/.test(value))) refuse();
  const quote = value => `'${String(value).replaceAll("'", "'\\''")}'`;
  const check = `printf '%s  %s\\n' ${[runtimeHash, runtime, launcherHash, launcher].map(quote).join(' ')} | /usr/bin/shasum -a 256 -c -s || exit 1`;
  const command = [runtime, launcher, manifestPath, digest, ...args].map(quote).join(' ');
  return `env -i PATH=/usr/bin:/bin /bin/sh -c ${quote(`${check}; exec ${command}`)}`;
}
class HelperOperationFailure extends Error {}
export async function launchVerified(args) {
  const [manifestPath, digest, ...helperArgs] = args;
  if (!manifestPath || !digest || !helperArgs.length || process.execArgv.length || process.env.NODE_OPTIONS || process.env.NODE_PATH) refuse();
  const root = dirname(fileURLToPath(import.meta.url));
  const manifest = verifyExecutable(root, manifestPath, digest);
  const runtime = manifest.runtimes.find(runtime => runtime.platform === process.platform && runtime.arch === process.arch);
  // Every ESM/CJS resolution stays within the complete verified tree, including package.json exports and generated JS/JSON.
  registerHooks({ resolve(specifier, context, nextResolve) {
    const result = nextResolve(specifier, context);
    if (isBuiltin(result.url)) return result;
    if (!result.url.startsWith('file:')) refuse();
    const path = realpathSync(fileURLToPath(result.url)), child = relative(root, path);
    if (!child || child === '..' || child.startsWith('../') || resolve(root, child) !== path) refuse();
    return result;
  } });
  const launcher = join(root, 'launch.mjs'), launcherHash = manifest.files.find(file => file.path === 'launch.mjs').sha256;
  Object.defineProperty(globalThis, Symbol.for('esty.activation.input.launcher'), { value: Object.freeze({
    launcher, manifest: resolve(manifestPath), digest,
    verify: () => verifyExecutable(root, manifestPath, digest),
    command: args => guardedOwnerCommand(process.execPath, launcher, runtime.sha256, launcherHash, resolve(manifestPath), digest, args),
  }) });
  const { inputHelperMain, inputFailureMessage } = await import(pathToFileURL(join(root, entry)).href);
  const abort = new AbortController(), cancel = () => abort.abort();
  const signals = ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGTSTP'];
  for (const signal of signals) process.on(signal, cancel);
  try { await inputHelperMain(helperArgs, abort.signal); }
  catch (error) { throw new HelperOperationFailure(inputFailureMessage(error)); }
  finally { for (const signal of signals) process.removeListener(signal, cancel); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await launchVerified(process.argv.slice(2)); }
  catch (error) {
    console.error(error instanceof HelperOperationFailure ? error.message
      : 'HELPER_EXECUTABLE_REFUSED: verify approved executable/input bindings; no private value is disclosed.');
    process.exitCode = 1;
  }
}
