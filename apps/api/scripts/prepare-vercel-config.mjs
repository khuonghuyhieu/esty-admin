import { lstatSync, readFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';
import { privateDirectory, readPrivate, writePrivate } from './private-files.mjs';
import { readHiddenPassword } from './hidden-input.mjs';
import { vercelConfiguration } from './vercel-config.mjs';

export function convertPrivatePair(root, writer = writePrivate, reader = readPrivate) {
  root = resolve(root);
  if (!readFileSync(join(root, '.gitignore'), 'utf8').split(/\r?\n/).includes('.openai/')) throw new Error('Private output requires the repository ignore rule.');
  const directory = privateDirectory(join(root, '.openai/private/backend'), false);
  const paths = ['runtime.vercel.json', 'operator.vercel.json'].map(name => join(directory, name));
  for (const path of paths) {
    try { lstatSync(path); throw new Error('Private output already exists.'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const pair = vercelConfiguration(reader(join(directory, 'runtime.json')), reader(join(directory, 'operator.json')));
  const created = [];
  try {
    writer(paths[0], pair.runtime); created.push(paths[0]);
    writer(paths[1], pair.operator); created.push(paths[1]);
  } catch {
    for (const path of created) unlinkSync(path);
    throw new Error('Conversion failed; newly created partial output removed.');
  }
  return { status: 'OWNER_VERCEL_FILES_PREPARED', runtime: '.openai/private/backend/runtime.vercel.json', operator: '.openai/private/backend/operator.vercel.json' };
}
export async function prepareVercel(args = process.argv.slice(2), root = fileURLToPath(new URL('../../../', import.meta.url)), input = process.stdin, output = process.stdout) {
  if (args.length === 0) {
    output.write('OWNER_INPUT_PENDING: no private files read or written. Later use --convert-to-vercel in your own TTY.\n');
    return;
  }
  if (args.length !== 1 || args[0] !== '--convert-to-vercel') throw new Error('Only explicit owner conversion is supported.');
  if (await readHiddenPassword(input, output) !== 'CONVERT') throw new Error('Conversion not confirmed.');
  output.write(JSON.stringify(convertPrivatePair(root)) + '\n');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { await prepareVercel(); }
  catch { console.error('Conversion refused or cancelled. Verify TTY, approved input fields, owner-only files and absent outputs. No private value is printed.'); process.exitCode = 1; }
}
