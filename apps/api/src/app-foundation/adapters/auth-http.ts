import { AppError } from '../application/errors.js';

export async function boundedText(response: Response, maximum = 65536): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new AppError('dependency_unavailable');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > maximum) throw new AppError('dependency_unavailable');
      chunks.push(next.value);
    }
    return Buffer.concat(chunks, size).toString('utf8');
  } catch {
    await reader.cancel().catch(() => {});
    throw new AppError('dependency_unavailable');
  } finally { reader.releaseLock(); }
}

export async function boundedJson(response: Response, maximum = 65536): Promise<unknown> {
  try { return JSON.parse(await boundedText(response, maximum)) as unknown; }
  catch { throw new AppError('dependency_unavailable'); }
}

export async function authRequest(url: string, headers: Record<string, string>, signal: AbortSignal,
  body?: Record<string, unknown>): Promise<{ status: number; data: unknown }> {
  try {
    const response = await fetch(url, {
      method: body === undefined ? 'GET' : 'POST', redirect: 'error', cache: 'no-store',
      headers: { ...headers, Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      signal: AbortSignal.any([signal, AbortSignal.timeout(1500)]),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, data: await boundedJson(response) };
  } catch { throw new AppError('dependency_unavailable'); }
}

export function jsonObject(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
