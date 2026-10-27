import { rm } from 'node:fs/promises';

// Only compiler-owned output; leave staged artifacts and other workspaces alone.
for (const directory of ['src', 'scripts', 'tests']) {
  await rm(new URL(`../build/${directory}/`, import.meta.url), { recursive: true, force: true });
}
