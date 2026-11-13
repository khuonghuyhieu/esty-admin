const maximumMetadata = 8 * 1024 * 1024;
function refuse() { throw new Error('Manual archive transport metadata differs.'); }

export function normalizeManualArchive(roots) {
  if (!Array.isArray(roots) || roots.length !== 2) refuse();
  const source = roots.find(entry => entry?.name === 'src');
  if (!source || !Array.isArray(source.children) || source.children.length !== 1) refuse();
  const directory = source.children[0];
  if (directory?.name !== '.vercel' || directory.type !== 'directory' || directory.mode !== 0o40555
    || !Array.isArray(directory.children) || directory.children.length !== 1) refuse();
  const part = directory.children[0];
  if (part?.name !== 'source.tgz.part1' || part.type !== 'invalid' || part.mode !== 0o666
    || typeof part.uid !== 'string' || !/^[a-f0-9]{40}$/.test(part.uid) || part.children !== undefined) refuse();
  // Adapt only the known transport envelope, not its UID or archive content.
  source.children = [{ ...part, name: 'project.tgz', type: 'file' }];
  return roots;
}

// CLI65.4.0 names compressed transport chunks separately from files inside the tar.
// Only the observed single-part protocol is supported; the sealed attestor still
// verifies its UID, canonical base64 and every runtime file, byte, mode and digest.
export function manualArchiveTransport(transport) {
  return async (raw, init) => {
    const response = await transport(raw, init), url = new URL(String(raw));
    if (url.origin !== 'https://api.vercel.com' || (init?.method ?? 'GET') !== 'GET'
      || !/^\/v6\/deployments\/dpl_[A-Za-z0-9]{1,124}\/files$/.test(url.pathname)
      || response.status !== 200 || response.redirected) return response;
    if (!response.body) refuse();
    const reader = response.body.getReader(), chunks = []; let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        total += value.length;
        if (total > maximumMetadata) { await reader.cancel(); refuse(); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    return Response.json(normalizeManualArchive(JSON.parse(Buffer.concat(chunks, total).toString('utf8'))));
  };
}
