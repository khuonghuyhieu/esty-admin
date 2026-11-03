import { AppError } from './errors.js';

export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function uuid(value: unknown): string {
  if (typeof value !== 'string' || !uuidPattern.test(value)) throw new AppError('invalid_request');
  return value.toLowerCase();
}

export function record(value: unknown, allowed: readonly string[], required = allowed): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AppError('invalid_request');
  const object = value as Record<string, unknown>;
  if (Object.keys(object).some(key => !allowed.includes(key))
    || required.some(key => !Object.hasOwn(object, key))) throw new AppError('invalid_request');
  return object;
}

export function revision(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value >= 2147483647) {
    throw new AppError('invalid_request');
  }
  return value;
}

export function displayName(value: unknown): string {
  if (typeof value !== 'string' || !value.isWellFormed() || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new AppError('invalid_request');
  }
  const trimmed = value.trim();
  let length = 0;
  for (const _point of trimmed) { if (++length > 100) break; }
  if (length < 1 || length > 100) throw new AppError('invalid_request');
  return trimmed;
}

export function email(value: unknown): string {
  if (typeof value !== 'string' || value.length > 254 || /[\u0000-\u0020\u007f]/u.test(value)
    || !/^[^@]+@[^@.]+(?:\.[^@.]+)+$/u.test(value)) throw new AppError('invalid_request');
  // GoTrue normalizes email case; never collapse plus tags or dots.
  return value.toLowerCase();
}

export function pageLimit(value: unknown): number {
  if (value === undefined) return 50;
  if (typeof value !== 'string' || !/^[1-9]\d{0,2}$/.test(value) || Number(value) > 100) {
    throw new AppError('invalid_request');
  }
  return Number(value);
}
