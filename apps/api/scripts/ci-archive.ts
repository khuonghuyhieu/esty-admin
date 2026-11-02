import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { safePath, sha256 } from './artifact.js';
import type { FileRecord } from './artifact.js';

const maximum = 250 * 1024 * 1024;
function reject(): never { throw new Error('Uploaded archive differs from the tested artifact.'); }
function text(bytes: Buffer): string {
  const end = bytes.indexOf(0), value = bytes.subarray(0, end < 0 ? bytes.length : end).toString('utf8');
  if (value.includes('\ufffd')) reject();
  return value;
}
function octal(bytes: Buffer): number {
  const value = text(bytes).trim();
  if (!/^[0-7]+$/.test(value)) reject();
  const result = Number.parseInt(value, 8);
  if (!Number.isSafeInteger(result)) reject();
  return result;
}
function pax(bytes: Buffer): Record<string, string> {
  const values: Record<string, string> = {}; let offset = 0;
  while (offset < bytes.length) {
    const space = bytes.indexOf(32, offset);
    if (space < 0) reject();
    const lengthText = bytes.subarray(offset, space).toString();
    if (!/^[1-9][0-9]{0,5}$/.test(lengthText)) reject();
    const length = Number(lengthText), end = offset + length;
    if (end > bytes.length || end <= space + 2 || bytes[end - 1] !== 10) reject();
    const entry = bytes.subarray(space + 1, end - 1).toString('utf8'), separator = entry.indexOf('=');
    if (separator < 1 || entry.includes('\ufffd')) reject();
    const key = entry.slice(0, separator);
    if (!['path', 'size', 'mtime', 'atime', 'ctime', 'uid', 'gid', 'uname', 'gname'].includes(key) || Object.hasOwn(values, key)) reject();
    values[key] = entry.slice(separator + 1); offset = end;
  }
  return values;
}
// Inspect bytes only: no extraction, links, devices, traversal, duplicate paths or unbounded inflation.
export function verifyUploadedArchive(compressed: Buffer, expected: readonly FileRecord[], expectedUid: string): void {
  if (!/^[a-f0-9]{40}$/.test(expectedUid) || compressed.length > maximum
    || createHash('sha1').update(compressed).digest('hex') !== expectedUid) reject();
  const bytes = gunzipSync(compressed, { maxOutputLength: maximum });
  const records = new Map(expected.map(file => [file.path, file]));
  if (!records.size || records.size !== expected.length) reject();
  const directories = new Set<string>();
  for (const path of records.keys()) {
    const parts = path.split('/'); parts.pop();
    while (parts.length) { directories.add(parts.join('/')); parts.pop(); }
  }
  const seen = new Set<string>(), seenDirectories = new Set<string>();
  let offset = 0, attributes: Record<string, string> | undefined, terminated = false;
  while (offset + 512 <= bytes.length) {
    const header = bytes.subarray(offset, offset + 512); offset += 512;
    if (header.every(byte => byte === 0)) {
      if (attributes || bytes.length - offset < 512 || !bytes.subarray(offset).every(byte => byte === 0)) reject();
      terminated = true; break;
    }
    let checksum = 0;
    for (let i = 0; i < 512; i++) checksum += i >= 148 && i < 156 ? 32 : header[i]!;
    if (checksum !== octal(header.subarray(148, 156))) reject();
    const type = header[156], size = octal(header.subarray(124, 136)), mode = octal(header.subarray(100, 108));
    if (size > 32 * 1024 * 1024 || offset + size > bytes.length || mode > 0o777) reject();
    const content = bytes.subarray(offset, offset + size); offset += Math.ceil(size / 512) * 512;
    if (offset > bytes.length) reject();
    if (type === 120) {
      if (attributes || size > 16384) reject();
      attributes = pax(content); continue;
    }
    if (type !== 0 && type !== 48 && type !== 53) reject();
    const prefix = text(header.subarray(345, 500));
    let path = attributes?.path ?? [prefix, text(header.subarray(0, 100))].filter(Boolean).join('/');
    if (attributes?.size !== undefined && attributes.size !== String(size)) reject();
    attributes = undefined;
    if (type === 53 && path.endsWith('/')) path = path.slice(0, -1);
    safePath(path);
    if (type === 53) {
      if (size || !directories.has(path) || seenDirectories.has(path) || mode !== 0o555) reject();
      seenDirectories.add(path); continue;
    }
    const file = records.get(path);
    if (!file || seen.has(path) || mode !== file.mode || size !== file.size || sha256(content) !== file.sha256
      || createHash('sha1').update(content).digest('hex') !== file.sha1) reject();
    seen.add(path);
  }
  if (!terminated || seen.size !== records.size) reject();
}
