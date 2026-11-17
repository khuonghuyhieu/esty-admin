import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { EtsyConfig } from '../config/config.js';
import { AppError } from '../app-foundation/application/errors.js';

export class EtsyFailure extends AppError {
  constructor(code: 'invalid_request' | 'configuration_unavailable' | 'upstream_unavailable' | 'upstream_rate_limited' | 'reconnect_required' | 'outcome_unknown' | 'connection_changed' | 'connection_busy', readonly retryAfterSeconds?: number) {
    super(code);
    this.name = 'EtsyFailure';
  }
}

export interface Envelope {
  formatVersion: 1;
  keyId: string;
  nonce: string;
  ciphertext: string;
  tag: string;
}

export class EtsyCredentials {
  constructor(private readonly config: EtsyConfig) {}

  seal(plaintext: string, binding: string): Envelope {
    const keyId = this.config.activeKeyId;
    const key = this.config.keyring.get(keyId);
    if (!key || Buffer.byteLength(plaintext) > 32768) throw new EtsyFailure('configuration_unavailable');
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, nonce);
    cipher.setAAD(Buffer.from(JSON.stringify(['etsy', 1, this.config.clientId, keyId, binding])));
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return { formatVersion: 1, keyId, nonce: nonce.toString('base64url'), ciphertext: ciphertext.toString('base64url'), tag: cipher.getAuthTag().toString('base64url') };
  }

  open(envelope: Envelope, binding: string): string {
    try {
      const key = this.config.keyring.get(envelope.keyId);
      if (envelope.formatVersion !== 1 || !key) throw new Error();
      const decode = (value: string, length?: number): Buffer => {
        if (typeof value !== 'string' || value.length > 44000 || !/^[A-Za-z0-9_-]*$/.test(value)) throw new Error();
        const bytes = Buffer.from(value, 'base64url');
        if (bytes.toString('base64url') !== value || (length !== undefined && bytes.length !== length)) throw new Error();
        return bytes;
      };
      const decipher = createDecipheriv('aes-256-gcm', key, decode(envelope.nonce, 12));
      decipher.setAAD(Buffer.from(JSON.stringify(['etsy', 1, this.config.clientId, envelope.keyId, binding])));
      decipher.setAuthTag(decode(envelope.tag, 16));
      return Buffer.concat([decipher.update(decode(envelope.ciphertext)), decipher.final()]).toString('utf8');
    } catch { throw new EtsyFailure('configuration_unavailable'); }
  }
}
