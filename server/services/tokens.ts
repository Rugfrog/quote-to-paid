import crypto from 'node:crypto';

/** Long random token for customer links (/q/…) and sessions: 32 bytes, URL-safe. */
export function newToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
