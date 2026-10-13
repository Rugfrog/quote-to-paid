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
