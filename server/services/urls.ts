import type { Request } from 'express';

/**
 * The web address customers' links should start with, e.g. https://quote-to-paid.onrender.com.
 * PUBLIC_URL wins; Render sets RENDER_EXTERNAL_URL automatically; otherwise use the address
 * the owner is using right now; finally the local dev address.
 */
export function publicBaseUrl(req?: Request): string {
  const fromEnv = process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL;
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  if (req) {
    const host = req.get('host');
    if (host) return `${req.protocol}://${host}`;
  }
  return 'http://localhost:5173';
}

export const quoteLink = (base: string, token: string) => `${base}/q/${token}`;
