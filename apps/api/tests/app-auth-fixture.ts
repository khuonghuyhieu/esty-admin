import { createServer } from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { decodeJwt, exportJWK, generateKeyPair, SignJWT } from 'jose';
import type { AppFoundationConfig } from '../src/config/config.js';

// A deliberately synthetic HTTP/JWKS peer for failure/claim boundary tests.
// It is not GoTrue and cannot establish real Auth/session/email acceptance.
export async function syntheticAuthPeer() {
  const keys = await generateKeyPair('ES256', { extractable: true });
  const kid = randomUUID();
  const publicKey = { ...await exportJWK(keys.publicKey), alg: 'ES256', use: 'sig', kid };
  const users = new Map<string, string>();
  const state = { jwksStatus: 200, userStatus: 200, inviteStatus: 200, otpStatus: 200,
    inviteCode: '', loseInviteAcknowledgement: false, inviteCalls: 0, otpCalls: 0 };
  let origin = '';
  const server = createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    const path = new URL(request.url ?? '/', origin).pathname;
    if (path === '/.well-known/jwks.json') {
      response.statusCode = state.jwksStatus;
      response.end(JSON.stringify({ keys: [publicKey] })); return;
    }
    if (path === '/user') {
      try {
        const claims = decodeJwt(request.headers.authorization?.slice(7) ?? '');
        const email = users.get(claims.sub ?? '');
        response.statusCode = email ? state.userStatus : 401;
        response.end(JSON.stringify({ id: claims.sub, email, email_confirmed_at: new Date(0).toISOString(), is_anonymous: false }));
      } catch { response.statusCode = 401; response.end('{}'); }
      return;
    }
    if (path === '/invite' || path === '/otp') {
      request.resume();
      request.once('end', () => {
        if (path === '/invite') {
          state.inviteCalls++;
          if (state.loseInviteAcknowledgement) { response.destroy(); return; }
          response.statusCode = state.inviteStatus;
          response.end(JSON.stringify(state.inviteStatus === 200 ? { id: randomUUID() } : { error_code: state.inviteCode }));
        } else { state.otpCalls++; response.statusCode = state.otpStatus; response.end('{}'); }
      });
      return;
    }
    response.statusCode = 404; response.end('{}');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Synthetic loopback peer did not bind.');
  origin = `http://127.0.0.1:${address.port}`;
  const config: AppFoundationConfig = {
    workspaceId: randomUUID(), authUrl: origin, jwksUrl: `${origin}/.well-known/jwks.json`, audience: 'authenticated',
    apiKey: 'synthetic-api-key', adminKey: 'synthetic-admin-key', emailEnabled: true, invitationRedirect: `${origin}/auth/invitation`,
  };
  return {
    config, state, users, keys, kid,
    async token(userId: string, sessionId: string, claims: Record<string, unknown> = {}, header: Record<string, unknown> = {}) {
      return new SignJWT({ iss: origin, aud: 'authenticated', sub: userId, iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 300, role: 'authenticated', is_anonymous: false, session_id: sessionId, ...claims })
        .setProtectedHeader({ alg: 'ES256', kid, ...header }).sign(keys.privateKey);
    },
    async close() {
      const closed = once(server, 'close');
      server.close(); server.closeAllConnections(); await closed;
    },
  };
}
