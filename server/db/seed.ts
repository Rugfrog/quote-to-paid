import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_DB_PATH, UPLOADS_DIR, openDb, type DB } from './db';
import { seedQuotes } from './seed-quotes';
import { demoBusiness, demoCustomers, demoEnquiries, demoPriceList, demoTeam, demoTemplates, demoUsers } from './seed-data';

function daysAgoIso(days: number, hour = 10): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, Math.floor(Math.random() * 60), 0, 0);
  return d.toISOString();
}

/** Empty every table (keeps the schema). Used by "Reset demo". */
export function clearAll(db: DB): void {
  const tables = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`)
    .all() as { name: string }[];
  db.pragma('foreign_keys = OFF');
  db.transaction(() => {
    for (const { name } of tables) db.prepare(`DELETE FROM "${name}"`).run();
  })();
  db.pragma('foreign_keys = ON');
}

/** Fill an empty database with the demo business. */
export function seedDemo(db: DB, { fastHash = false, withQuotes = true } = {}): void {
  const hashRounds = fastHash ? 4 : 10;
  db.transaction(() => {
    const b = demoBusiness;
    db.prepare(
      `INSERT INTO business (id, name, trade, owner_name, address_line1, address_line2, town, postcode, phone, email,
        website, brand_colour, vat_registered, vat_number, vat_rate_bp, bank_name, account_name, sort_code, account_number,
        quote_terms, default_validity_days, default_deposit_bp, payment_terms_days)
       VALUES (1, @name, @trade, @owner_name, @address_line1, @address_line2, @town, @postcode, @phone, @email,
        @website, @brand_colour, @vat_registered, @vat_number, @vat_rate_bp, @bank_name, @account_name, @sort_code,
        @account_number, @quote_terms, @default_validity_days, @default_deposit_bp, @payment_terms_days)`,
    ).run(b);

    // On a hosted site, private passwords from the environment replace the public demo ones.
    const overrides = { owner: process.env.OWNER_PASSWORD, agency: process.env.AGENCY_PASSWORD };
    const insertUser = db.prepare(`INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)`);
    for (const u of demoUsers) {
      const password = overrides[u.role as 'owner' | 'agency'] || u.password;
      insertUser.run(u.email, u.name, bcrypt.hashSync(password, hashRounds), u.role);
    }

    const insertTeam = db.prepare(`INSERT INTO team_members (name, phone, role_label) VALUES (?, ?, ?)`);
    for (const t of demoTeam) insertTeam.run(t.name, t.phone, t.role_label);

    const insertPrice = db.prepare(
      `INSERT INTO price_items (category, name, description, unit, unit_price_pence, kind, rate_bp, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    demoPriceList.forEach((p, i) =>
      insertPrice.run(p.category, p.name, p.description ?? '', p.unit, p.price, p.kind ?? 'standard', p.rate_bp ?? 0, i + 1),
    );

    const insertCustomer = db.prepare(
      `INSERT INTO customers (name, phone, email, address_line1, address_line2, town, postcode, notes, created_at)
       VALUES (@name, @phone, @email, @address_line1, @address_line2, @town, @postcode, @notes, @created_at)`,
    );
    const customerIds = demoCustomers.map((c, i) => {
      const firstEnquiry = demoEnquiries.find((e) => e.customer === i);
      const created_at = daysAgoIso(firstEnquiry ? firstEnquiry.daysAgo : 56);
      return Number(insertCustomer.run({ ...c, created_at }).lastInsertRowid);
    });

    const insertEnquiry = db.prepare(
      `INSERT INTO enquiries (customer_id, description, source, status, received_at) VALUES (?, ?, ?, 'new', ?)`,
    );
    for (const e of demoEnquiries) insertEnquiry.run(customerIds[e.customer], e.description, e.source, daysAgoIso(e.daysAgo));

    const insertTemplate = db.prepare(
      `INSERT INTO message_templates (key, label, channel, subject, body) VALUES (@key, @label, @channel, @subject, @body)`,
    );
    for (const t of demoTemplates) insertTemplate.run(t);
  })();
  if (withQuotes) seedQuotes(db);
}

/** Wipe everything (including uploaded files) and re-seed. */
export function resetDemo(db: DB, options?: { fastHash?: boolean; withQuotes?: boolean }): void {
  clearAll(db);
  if (fs.existsSync(UPLOADS_DIR)) {
    for (const file of fs.readdirSync(UPLOADS_DIR)) fs.rmSync(path.join(UPLOADS_DIR, file), { force: true });
  }
  seedDemo(db, options);
}

// Run from the command line: `npm run seed` (only if empty) or `npm run reset` (wipe and re-seed).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const reset = process.argv.includes('--reset');
  const db = openDb(DEFAULT_DB_PATH);
  const hasData = db.prepare('SELECT 1 FROM business WHERE id = 1').get();
  if (reset) {
    resetDemo(db);
    console.log('Demo data reset: Holme Valley Plastering & Building is ready.');
  } else if (hasData) {
    console.log('Database already has data. Use `npm run reset` to start again.');
  } else {
    seedDemo(db);
    console.log('Demo data added: Holme Valley Plastering & Building is ready.');
  }
  db.close();
}
