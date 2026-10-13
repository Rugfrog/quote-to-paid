import 'dotenv/config';
import { createApp } from './app';
import { openDb } from './db/db';
import { seedDemo } from './db/seed';
import { applyPasswordOverrides, demoResetHours, isDemoMode, startDemoResets, startupProblems } from './demo';

const problems = startupProblems();
if (problems.length) {
  console.error(`Not starting, to keep your AI credits safe:\n- ${problems.join('\n- ')}\nSee "Putting it online" in the README.`);
  process.exit(1);
}

const db = openDb();

// First run: fill the database with the demo business so `npm run dev` just works.
if (!db.prepare('SELECT 1 FROM business WHERE id = 1').get()) {
  seedDemo(db);
  console.log('First run: added the demo business (log in as gary@example.com / demo1234).');
}

applyPasswordOverrides(db);

if (isDemoMode()) {
  startDemoResets(db);
  console.log(`Public demo mode: data resets every ${demoResetHours()} hours and logins can't be changed.`);
}

const port = Number(process.env.PORT ?? 3001);
const production = process.env.NODE_ENV === 'production';
const app = createApp(db, { serveWeb: production });

app.listen(port, () => {
  console.log(
    production
      ? `Quote to Paid is running at http://localhost:${port}`
      : `API ready on http://localhost:${port}. Open the app at http://localhost:5173`,
  );
});
