import { constants, lstatSync, fstatSync, mkdirSync, openSync, closeSync, writeFileSync, unlinkSync, readFileSync } from 'node:fs';
import { resolve, dirname, parse, join } from 'node:path';

export function privateDirectory(path, create = true) {
  path = resolve(path);
  let cursor = parse(path).root;
  for (const part of path.slice(cursor.length).split('/').filter(Boolean)) {
    cursor = join(cursor, part);
    if (create) { try { mkdirSync(cursor, { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') throw error; } }
    const stat = lstatSync(cursor);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Private path must not contain symlinks.');
  }
  const stat = lstatSync(path);
  if (stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o700) throw new Error('Private directory must be owner-only (0700).');
  return path;
}
export function writePrivate(path, value) {
  privateDirectory(dirname(path));
  const fd = openSync(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
  try { writeFileSync(fd, JSON.stringify(value, null, 2) + '\n'); }
  catch (error) { unlinkSync(path); throw error; }
  finally { closeSync(fd); }
}
export function readPrivateBytes(path, maximumBytes = 65536) {
  if (!Number.isInteger(maximumBytes) || maximumBytes < 1 || maximumBytes > 262144) throw new Error('Private input size bound is invalid.');
  privateDirectory(dirname(path), false);
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o600 || stat.size > maximumBytes) throw new Error('Private file must be an owner-only bounded regular file (0600).');
    const bytes = readFileSync(fd), after = fstatSync(fd);
    if (bytes.length !== stat.size || after.size !== stat.size || after.ino !== stat.ino
      || after.mtimeMs !== stat.mtimeMs || after.ctimeMs !== stat.ctimeMs) throw new Error('Private file changed while being read.');
    return bytes;
  } finally { closeSync(fd); }
}
export function readPrivate(path, maximumBytes = 65536) {
  const bytes = readPrivateBytes(path, maximumBytes);
  try { return JSON.parse(bytes.toString('utf8')); }
  finally { bytes.fill(0); }
}
