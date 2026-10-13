import bcrypt from 'bcryptjs';
import { Router, type RequestHandler } from 'express';
import { loginSchema } from '../shared/schemas';
import type { DB } from './db/db';
import { HttpError, validate } from './http';
import { hashToken, newToken } from './services/tokens';

export interface SessionUser {
  id: number;
  email: string;
  name: string;
  role: 'owner' | 'staff' | 'agency';
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

export const SESSION_COOKIE = 'qtp_session';
const SESSION_DAYS = 30;

// Simple in-memory limit on login attempts: 10 tries per 15 minutes per IP + email.
const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

function tooManyAttempts(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) return false;
  return entry.count >= MAX_ATTEMPTS;
}

function recordFailure(key: string): void {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
  else entry.count++;
}

/** Reads the session cookie and sets req.user if it's valid. Doesn't block anything. */
export function loadUser(db: DB): RequestHandler {
  const find = db.prepare(
    `SELECT u.id, u.email, u.name, u.role FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ?`,
  );
  return (req, _res, next) => {
    const token = req.cookies?.[SESSION_COOKIE];
    if (typeof token === 'string' && token.length > 20) {
      req.user = find.get(hashToken(token), new Date().toISOString()) as SessionUser | undefined;
    }
    next();
  };
}

export const requireUser: RequestHandler = (req, _res, next) => {
  if (!req.user) return next(new HttpError(401, 'Please log in.'));
  next();
};

export const requireAgency: RequestHandler = (req, _res, next) => {
  if (!req.user) return next(new HttpError(401, 'Please log in.'));
  if (req.user.role !== 'agency') return next(new HttpError(403, 'Only the setup team can open this page.'));
  next();
};

export function authRouter(db: DB): Router {
  const router = Router();

  router.post('/login', (req, res) => {
    const { email, password } = validate(loginSchema, req.body);
    const key = `${req.ip}|${email}`;
    if (tooManyAttempts(key)) {
      throw new HttpError(429, 'Too many tries. Please wait 15 minutes and try again.');
    }
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as
      | (SessionUser & { password_hash: string })
      | undefined;
    // Compare against a dummy hash when the user doesn't exist, so timing doesn't reveal valid emails.
    const ok = bcrypt.compareSync(password, user?.password_hash ?? DUMMY_HASH);
    if (!user || !ok) {
      recordFailure(key);
      throw new HttpError(401, 'That email and password don’t match. Please try again.');
    }
    attempts.delete(key);

    const token = newToken();
    const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(new Date().toISOString());
    db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(
      hashToken(token),
      user.id,
      expires.toISOString(),
    );
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production' && process.env.INSECURE_COOKIES !== '1',
      expires,
      path: '/',
    });
    res.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  });

  router.post('/logout', (req, res) => {
    const token = req.cookies?.[SESSION_COOKIE];
    if (typeof token === 'string') db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  // Returns { user: null } rather than a 401, so the login page loads without a console error.
  router.get('/me', (req, res) => {
    res.json({ user: req.user ?? null });
  });

  return router;
}
