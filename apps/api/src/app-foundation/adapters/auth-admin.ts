import type { AppFoundationConfig } from '../../config/config.js';
import { AppError } from '../application/errors.js';
import { email, uuidPattern } from '../application/validation.js';
import { authRequest, jsonObject } from './auth-http.js';

export type DeliveryOutcome = 'confirmed' | 'failed' | 'unknown';

export class AuthAdmin {
  constructor(private readonly config: AppFoundationConfig, private readonly operatorKey?: string) {}

  get deliveryEnabled(): boolean { return this.config.emailEnabled && Boolean(this.config.adminKey); }

  async verifiedUser(userId: string, signal: AbortSignal): Promise<{ userId: string; email: string }> {
    const key = this.operatorKey;
    if (!key || !uuidPattern.test(userId)) throw new AppError('forbidden');
    const response = await authRequest(`${this.config.authUrl}/admin/users/${userId}`, {
      apikey: key, Authorization: `Bearer ${key}`,
    }, signal);
    if (response.status !== 200) throw new AppError('dependency_unavailable');
    const user = jsonObject(response.data);
    if (user?.id !== userId || user.is_anonymous === true || typeof user.email_confirmed_at !== 'string'
      || !Number.isFinite(Date.parse(user.email_confirmed_at))) throw new AppError('forbidden');
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
