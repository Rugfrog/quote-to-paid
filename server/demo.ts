import bcrypt from 'bcryptjs';
import type { DB } from './db/db';
import { resetDemo } from './db/seed';

/**
 * Public demo mode (DEMO_MODE=1), for running the app on the internet where anyone
 * with the demo login can get in:
 *  - the data resets itself every DEMO_RESET_HOURS (default 6);
 *  - logins can't be changed, so nobody can lock everyone else out;
 *  - the login page warns people not to enter real customer details.
 */
export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === '1';
}

/**
 * Private passwords for the hosted site, set as environment variables on the host
 * (never in the code, which is public). They replace the demo passwords.
 */
export function passwordOverrides(): { owner?: string; agency?: string } {
  return {
    owner: process.env.OWNER_PASSWORD || undefined,
    agency: process.env.AGENCY_PASSWORD || undefined,
  };
}

/** Make the stored logins match OWNER_PASSWORD / AGENCY_PASSWORD (run at start-up). */
export function applyPasswordOverrides(db: DB): void {
  const { owner, agency } = passwordOverrides();
  const update = db.prepare('UPDATE users SET password_hash = ? WHERE role = ?');
  if (owner) update.run(bcrypt.hashSync(owner, 10), 'owner');
  if (agency) update.run(bcrypt.hashSync(agency, 10), 'agency');
}

/** Show the demo logins on the login page only while they're the real ones. */
export function demoLoginsVisible(): boolean {
  const { owner, agency } = passwordOverrides();
  return !owner && !agency;
}

export const MIN_PRIVATE_PASSWORD = 12;

/**
 * Reasons the server must not start. With a real AI key on a public website, the logins
 * must be private, or anyone could spend the credits.
 */
export function startupProblems(env: NodeJS.ProcessEnv = process.env): string[] {
  const problems: string[] = [];
  if (env.NODE_ENV !== 'production' || !env.ANTHROPIC_API_KEY) return problems;
  for (const key of ['OWNER_PASSWORD', 'AGENCY_PASSWORD'] as const) {
    const value = env[key] ?? '';
    if (!value) problems.push(`${key} must be set when ANTHROPIC_API_KEY is set.`);
    else if (value.length < MIN_PRIVATE_PASSWORD) problems.push(`${key} must be at least ${MIN_PRIVATE_PASSWORD} characters.`);
  }
  return problems;
}

export function demoResetHours(): number {
  const hours = Number(process.env.DEMO_RESET_HOURS ?? 6);
  return Number.isFinite(hours) && hours > 0 ? hours : 6;
}

/** Start the reset timer. Returns a function that stops it. */
export function startDemoResets(db: DB): () => void {
  const ms = demoResetHours() * 60 * 60 * 1000;
  const timer = setInterval(() => {
    resetDemo(db);
    console.log(`Public demo: data reset (next in ${demoResetHours()} hours).`);
  }, ms);
  timer.unref();
  return () => clearInterval(timer);
}
