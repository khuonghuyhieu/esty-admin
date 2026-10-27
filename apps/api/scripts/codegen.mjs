import { mkdir, readFile, writeFile } from 'node:fs/promises';
import openapiTS, { astToString } from 'openapi-typescript';

const contract = new URL('../../../specs/001-connectivity-foundation/contracts/openapi.json', import.meta.url);
const destination = new URL('../src/generated/api.ts', import.meta.url);
const generated = '// Generated from feature 001 OpenAPI. Run api:codegen; do not edit.\n'
  + astToString(await openapiTS(contract));
if (process.argv.includes('--check')) {
  const current = await readFile(destination, 'utf8').catch(() => '');
  if (current !== generated) {
    console.error('API contract output is missing or stale. Run npm run api:codegen.');
    process.exitCode = 1;
  }
} else {
  await mkdir(new URL('../src/generated/', import.meta.url), { recursive: true });
  await writeFile(destination, generated);
}
