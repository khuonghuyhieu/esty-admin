import { createHash, randomBytes } from 'node:crypto';
import type { EtsyConfig } from '../config/config.js';
import { EtsyFailure } from './credentials.js';

export interface EtsyTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  scope: 'shops_r';
  expiresAt: number;
}
export interface EtsyMetadata {
  etsyUserId: string;
  shopId: string;
  shopName: string;
  currencyCode: string;
}
export type EtsyFetch = (url: string, init: RequestInit) => Promise<Response>;

export function etsyId(value: unknown): string {
  if (typeof value === 'number' && Number.isSafeInteger(value)) value = String(value);
  if (typeof value !== 'string' || !/^[1-9]\d{0,18}$/.test(value) || BigInt(value) > 9223372036854775807n) {
    throw new EtsyFailure('invalid_request');
  }
  return value;
}

export class EtsyProvider {
  constructor(private readonly config: EtsyConfig, private readonly transport: EtsyFetch = fetch) {}

  authorization(): { state: string; verifier: string; url: string } {
    const state = randomBytes(32).toString('base64url');
    const verifier = randomBytes(32).toString('base64url');
    const query = new URLSearchParams({ response_type: 'code', client_id: this.config.clientId,
      redirect_uri: this.config.callbackUrl, scope: 'shops_r', state,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' });
    return { state, verifier, url: `https://www.etsy.com/oauth/connect?${query}` };
  }

  async exchange(code: string, verifier: string, signal: AbortSignal): Promise<EtsyTokens> {
    if (!/^[\x21-\x7e]{1,2048}$/.test(code) || !/^[A-Za-z0-9_-]{43}$/.test(verifier)) throw new EtsyFailure('invalid_request');
    return this.token({ grant_type: 'authorization_code', client_id: this.config.clientId,
      redirect_uri: this.config.callbackUrl, code, code_verifier: verifier }, signal);
  }

  async refresh(refreshToken: string, signal: AbortSignal): Promise<EtsyTokens> {
    if (!/^[\x21-\x7e]{1,8192}$/.test(refreshToken)) throw new EtsyFailure('configuration_unavailable');
    return this.token({ grant_type: 'refresh_token', client_id: this.config.clientId, refresh_token: refreshToken }, signal);
  }

  private async token(fields: Record<string, string>, signal: AbortSignal): Promise<EtsyTokens> {
    const requestedAt = Date.now();
    const received = await this.request('/v3/public/oauth/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8' },
      body: new URLSearchParams(fields).toString(),
    }, 3000, signal);
    if (typeof received.access_token !== 'string' || !/^[1-9]\d{0,18}\.[\x21-\x7e]+$/.test(received.access_token)
      || received.access_token.length > 8192 || typeof received.refresh_token !== 'string'
      || !/^[\x21-\x7e]{1,8192}$/.test(received.refresh_token)
      || received.token_type !== 'Bearer' || received.scope !== 'shops_r'
      || !Number.isInteger(received.expires_in) || Number(received.expires_in) < 1 || Number(received.expires_in) > 3600) {
      throw new EtsyFailure('outcome_unknown');
    }
    etsyId(received.access_token.split('.')[0]);
    return { accessToken: received.access_token, refreshToken: received.refresh_token, tokenType: 'Bearer',
      scope: 'shops_r', expiresAt: requestedAt + Number(received.expires_in) * 1000 };
  }

  async metadata(tokens: EtsyTokens, expectedShopId: string, expectedUserId: string | null, signal: AbortSignal): Promise<EtsyMetadata> {
    const headers = { Authorization: `Bearer ${tokens.accessToken}` };
    const me = await this.request('/v3/application/users/me', { headers }, 1500, signal);
    try {
      const etsyUserId = etsyId(me.user_id), shopId = etsyId(me.shop_id);
      if (shopId !== expectedShopId || (expectedUserId !== null && etsyUserId !== expectedUserId)
        || etsyUserId !== tokens.accessToken.split('.')[0]) throw new Error();
      const shop = await this.request(`/v3/application/shops/${shopId}`, { headers }, 1500, signal);
      if (etsyId(shop.shop_id) !== shopId || etsyId(shop.user_id) !== etsyUserId
        || typeof shop.shop_name !== 'string' || !shop.shop_name.trim() || [...shop.shop_name].length > 256
        || typeof shop.currency_code !== 'string' || !/^[A-Z]{3}$/.test(shop.currency_code)) throw new Error();
      return { etsyUserId, shopId, shopName: shop.shop_name, currencyCode: shop.currency_code };
    } catch (error) {
      if (error instanceof EtsyFailure && error.code !== 'invalid_request') throw error;
      throw new EtsyFailure('reconnect_required');
    }
  }

  private async request(path: string, init: RequestInit, timeout: number, parent: AbortSignal): Promise<Record<string, unknown>> {
    const signal = AbortSignal.any([parent, AbortSignal.timeout(timeout)]);
    try {
      signal.throwIfAborted();
      const headers = new Headers(init.headers);
      headers.set('x-api-key', `${this.config.clientId}:${this.config.sharedSecret}`);
      headers.set('Accept', 'application/json');
      const response = await this.transport(`https://api.etsy.com${path}`, { ...init, headers, redirect: 'error', signal });
      if (!response.ok) {
        await response.body?.cancel();
        if (response.status === 429) {
          const raw = response.headers.get('retry-after') ?? '';
          const retry = /^\d{1,10}$/.test(raw) ? Math.max(1, Math.min(86400, Number(raw))) : 60;
          throw new EtsyFailure('upstream_rate_limited', retry);
        }
        if (response.status === 400 || response.status === 401 || response.status === 403) throw new EtsyFailure('reconnect_required');
        throw new EtsyFailure('upstream_unavailable');
      }
      if (!response.body) throw new Error();
      const reader = response.body.getReader();
      const abort = (): void => { void reader.cancel().catch(() => {}); };
      signal.addEventListener('abort', abort, { once: true });
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          signal.throwIfAborted();
          const { value, done } = await reader.read();
          signal.throwIfAborted();
          if (done) break;
          size += value.byteLength;
          if (size > 65536) throw new Error();
          chunks.push(value);
        }
      } finally {
        signal.removeEventListener('abort', abort);
        await reader.cancel().catch(() => {});
      }
      const text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
      const parsed: unknown = JSON.parse(text, (_key: string, value: unknown, context?: { source: string }) => {
        if (typeof value === 'number' && !Number.isSafeInteger(value) && context && /^\d+$/.test(context.source)) return context.source;
        return value;
      });
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
      return parsed as Record<string, unknown>;
    } catch (error) {
      if (error instanceof EtsyFailure) throw error;
      throw new EtsyFailure('upstream_unavailable');
    }
  }
}
