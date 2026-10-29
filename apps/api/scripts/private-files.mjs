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
export function readPrivate(path) {
  privateDirectory(dirname(path), false);
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o600 || stat.size > 65536) throw new Error('Private file must be an owner-only regular file (0600).');
    return JSON.parse(readFileSync(fd, 'utf8'));
  } finally { closeSync(fd); }
}
