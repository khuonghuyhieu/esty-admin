import { createRemoteJWKSet, customFetch, errors, jwtVerify } from 'jose';
import type { AppFoundationConfig } from '../../config/config.js';
import { AppError } from '../application/errors.js';
import { email, uuidPattern } from '../application/validation.js';
import { authRequest, boundedText, jsonObject } from './auth-http.js';

export interface VerifiedIdentity {
  userId: string;
  sessionId: string;
  email: string;
}

export class AuthVerifier {
  private readonly keys;

  constructor(private readonly config: AppFoundationConfig) {
    this.keys = createRemoteJWKSet(new URL(config.jwksUrl), {
      timeoutDuration: 1000, cooldownDuration: 30000, cacheMaxAge: 600000,
      [customFetch]: async (url, options) => {
        // Only public keys are shared. No user token/session is cached here.
        const response = await fetch(url, { ...options, redirect: 'error', cache: 'no-store',
          signal: AbortSignal.timeout(1000) });
        if (response.status !== 200) {
          await response.body?.cancel();
          throw new AppError('dependency_unavailable');
        }
        return new Response(await boundedText(response, 32768), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        });
      },
    });
  }

  async verify(token: string, signal: AbortSignal): Promise<VerifiedIdentity> {
    if (token.length > 8192 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) {
      throw new AppError('unauthenticated');
    }
    try {
      signal.throwIfAborted();
      const { payload, protectedHeader } = await jwtVerify(token, this.keys, {
        issuer: this.config.authUrl, audience: this.config.audience, algorithms: ['ES256', 'RS256'],
        requiredClaims: ['exp', 'sub', 'session_id', 'role', 'is_anonymous'], clockTolerance: 0,
      });
      if (typeof payload.sub !== 'string' || !uuidPattern.test(payload.sub)
        || typeof payload.session_id !== 'string' || !uuidPattern.test(payload.session_id)
        || payload.role !== 'authenticated' || payload.is_anonymous !== false
        || typeof protectedHeader.kid !== 'string' || protectedHeader.kid.length > 128
        || protectedHeader.jku !== undefined || protectedHeader.jwk !== undefined || protectedHeader.x5u !== undefined) {
        throw new AppError('unauthenticated');
      }
      signal.throwIfAborted();
      const response = await authRequest(`${this.config.authUrl}/user`, {
        apikey: this.config.apiKey, Authorization: `Bearer ${token}`,
      }, signal);
      if (response.status === 401 || response.status === 403) throw new AppError('unauthenticated');
      if (response.status !== 200) throw new AppError('dependency_unavailable');
      const user = jsonObject(response.data);
      if (user?.id !== payload.sub || user.is_anonymous === true || typeof user.email_confirmed_at !== 'string'
        || !Number.isFinite(Date.parse(user.email_confirmed_at))) throw new AppError('unauthenticated');
      let verifiedEmail: string;
      try { verifiedEmail = email(user.email); } catch { throw new AppError('unauthenticated'); }
      signal.throwIfAborted();
      return { userId: payload.sub.toLowerCase(), sessionId: payload.session_id.toLowerCase(), email: verifiedEmail };
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof errors.JWKSTimeout || error instanceof errors.JWKSInvalid
        || error instanceof errors.JWKSMultipleMatchingKeys) throw new AppError('dependency_unavailable');
      if (error instanceof errors.JOSEError) throw new AppError('unauthenticated');
      throw new AppError('dependency_unavailable');
    }
  }
}
