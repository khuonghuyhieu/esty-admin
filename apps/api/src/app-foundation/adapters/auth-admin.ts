import type { AppFoundationConfig } from '../../config/config.js';
import { AppError } from '../application/errors.js';
import { email, uuidPattern } from '../application/validation.js';
import { authRequest, jsonObject } from './auth-http.js';

export type DeliveryOutcome = 'confirmed' | 'failed' | 'unknown';

export interface AuthUserObservation {
  status: 'verified' | 'refused';
  substage: 'input' | 'transport' | 'body' | 'json' | 'http-status' | 'schema' | 'user-id' | 'anonymous' | 'confirmed' | 'email' | 'complete';
  httpStatus: number | null;
  category: 'passed' | 'refused' | 'unavailable' | 'aborted';
}

export class AuthAdmin {
  constructor(private readonly config: AppFoundationConfig, private readonly operatorKey?: string) {}

  get deliveryEnabled(): boolean { return this.config.emailEnabled && Boolean(this.config.adminKey); }

  verifiedUser(userId: string, signal: AbortSignal): Promise<{ userId: string; email: string }> {
    return this.verifyUser(userId, signal);
  }

  async inspectVerifiedUser(userId: string, signal: AbortSignal): Promise<AuthUserObservation> {
    let substage: AuthUserObservation['substage'] = 'input', httpStatus: number | null = null;
    try {
      signal.throwIfAborted();
      await this.verifyUser(userId, signal, (stage, status) => {
        substage = stage;
        if (status !== undefined) httpStatus = status;
      });
      signal.throwIfAborted();
      return { status: 'verified', substage: 'complete', httpStatus, category: 'passed' };
    } catch {
      return { status: 'refused', substage, httpStatus, category: signal.aborted ? 'aborted'
        : ['transport', 'body', 'json', 'http-status'].includes(substage) ? 'unavailable' : 'refused' };
    }
  }

  private async verifyUser(userId: string, signal: AbortSignal,
    observe?: (stage: AuthUserObservation['substage'], status?: number | null) => void): Promise<{ userId: string; email: string }> {
    const key = this.operatorKey;
    if (!key || !uuidPattern.test(userId)) throw new AppError('forbidden');
    const response = await authRequest(`${this.config.authUrl}/admin/users/${userId}`, {
      apikey: key, Authorization: `Bearer ${key}`,
    }, signal, undefined, observe);
    observe?.('http-status');
    if (response.status !== 200) throw new AppError('dependency_unavailable');
    const user = jsonObject(response.data);
    observe?.('schema');
    if (!user) throw new AppError('forbidden');
    observe?.('user-id');
    if (user.id !== userId) throw new AppError('forbidden');
    observe?.('anonymous');
    if (user.is_anonymous === true) throw new AppError('forbidden');
    observe?.('confirmed');
    if (typeof user.email_confirmed_at !== 'string'
      || !Number.isFinite(Date.parse(user.email_confirmed_at))) throw new AppError('forbidden');
    observe?.('email');
    return { userId, email: email(user.email) };
  }

  async sendInvitation(recipient: string, invitationId: string, signal: AbortSignal): Promise<DeliveryOutcome> {
    if (!this.deliveryEnabled) throw new AppError('delivery_unavailable');
    const key = this.config.adminKey!;
    const redirect = encodeURIComponent(`${this.config.invitationRedirect}?invitation=${invitationId}`);
    try {
      const invite = await authRequest(`${this.config.authUrl}/invite?redirect_to=${redirect}`, {
        apikey: key, Authorization: `Bearer ${key}`,
      }, signal, { email: recipient });
      const body = jsonObject(invite.data);
      if (invite.status === 200) {
        return typeof body?.id === 'string' && uuidPattern.test(body.id) ? 'confirmed' : 'unknown';
      }
      // Pinned GoTrue returns email_exists before sending when the identity is
      // already confirmed. Only this conclusive no-send result permits OTP.
      if (invite.status === 422 && body?.error_code === 'email_exists') {
        const otp = await authRequest(`${this.config.authUrl}/otp?redirect_to=${redirect}`, {
          apikey: this.config.apiKey,
        }, signal, { email: recipient, create_user: false });
        if (otp.status === 200) return 'confirmed';
        return otp.status >= 400 && otp.status < 500 ? 'failed' : 'unknown';
      }
      return invite.status >= 400 && invite.status < 500 ? 'failed' : 'unknown';
    } catch { return 'unknown'; }
  }
}
