import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import openapiTS, { astToString } from 'openapi-typescript';
import ts from 'typescript';

const sourceUrl = 'https://www.etsy.com/openapi/generated/oas/3.0.0.json';
const sourceSha256 = 'd9560cf25d1169ee9900a551ffaa4a7ca7b24a621e53a3fc3e5a70064af6c5ae';
const snapshot = new URL('../src/generated/etsy-transport.json', import.meta.url);
const output = new URL('../src/generated/etsy-transport.ts', import.meta.url);
const check = process.argv.includes('--check');
const sourceIndex = process.argv.indexOf('--source');
let selected;
if (sourceIndex !== -1) {
  const bytes = await readFile(process.argv[sourceIndex + 1]);
  if (createHash('sha256').update(bytes).digest('hex') !== sourceSha256) throw new Error('Upstream schema drift: review before updating the pin.');
  const upstream = JSON.parse(bytes);
  if (upstream.openapi !== '3.0.2' || upstream.info.version !== '3.0.0'
    || upstream.paths['/v3/application/users/me'].get.operationId !== 'getMe'
    || upstream.paths['/v3/application/shops/{shop_id}'].get.operationId !== 'getShop'
    || JSON.stringify(upstream.paths['/v3/application/users/me'].get.security) !== JSON.stringify([{ api_key: [], oauth2: ['shops_r'] }])) {
    throw new Error('Selected upstream operation contract changed.');
  }
  const schemas = {};
  for (const [name, fields] of Object.entries({ Self: ['user_id', 'shop_id'], Shop: ['shop_id', 'user_id', 'shop_name', 'currency_code'] })) {
    schemas[name] = { type: 'object', properties: {} };
    for (const field of fields) {
      const property = upstream.components.schemas[name].properties[field];
      if (!property || !['integer', 'string'].includes(property.type)) throw new Error('Selected upstream field missing.');
      schemas[name].properties[field] = property;
    }
  }
  selected = { openapi: upstream.openapi, info: { title: 'Selected internal Etsy transport projection', version: upstream.info.version },
    'x-provenance': { sourceUrl, sourceSha256, sourceBytes: bytes.length, generator: 'openapi-typescript@7.13.0', selection: 'getMe/getShop response fields only; token schema follows authentication guide' },
    paths: {}, components: { schemas } };
} else selected = JSON.parse(await readFile(snapshot, 'utf8'));
if (selected['x-provenance'].sourceSha256 !== sourceSha256) throw new Error('Pinned snapshot provenance mismatch.');
const json = `${JSON.stringify(selected, null, 2)}\n`;
const generated = '// Generated internal upstream transport only; no runtime proxy. Run scripts/etsy-codegen.mjs.\n'
  + astToString(await openapiTS(selected, {
    transform(schema) {
      // Decimal strings preserve all positive int64 values after lossless JSON decoding.
      if (schema.type === 'integer' && schema.format === 'int64') return { schema: ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword), questionToken: true };
    },
  }));
if (check) {
  if (await readFile(snapshot, 'utf8') !== json || await readFile(output, 'utf8') !== generated) throw new Error('Selected Etsy transport output is stale.');
  console.log('Pinned Etsy transport generation is current.');
} else {
  await writeFile(snapshot, json);
  await writeFile(output, generated);
}
