import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { createApp } from '../app';
import { openDb } from '../db/db';
import { seedDemo } from '../db/seed';

/** A fresh seeded in-memory database and app for each test file. */
export function testApp() {
  const db = openDb(':memory:');
  seedDemo(db, { fastHash: true, withQuotes: false });
  const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qtp-uploads-'));
  const app = createApp(db, { uploadsDir });
  return { db, app, uploadsDir };
}

/** A supertest agent that's logged in (keeps the session cookie). */
export async function loggedIn(app: ReturnType<typeof createApp>, email = 'gary@example.com', password = 'demo1234') {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email, password });
  if (res.status !== 200) throw new Error(`Login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return agent;
}
