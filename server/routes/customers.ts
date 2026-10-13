import { Router } from 'express';
import { customerSchema } from '../../shared/schemas';
import { requireUser } from '../auth';
import type { DB } from '../db/db';
import { idParam, notFound, validate } from '../http';
import { uploadUrl } from '../uploads';

export function insertCustomer(db: DB, input: ReturnType<typeof customerSchema.parse>): number {
  const info = db
    .prepare(
      `INSERT INTO customers (name, phone, email, address_line1, address_line2, town, postcode, notes)
       VALUES (@name, @phone, @email, @address_line1, @address_line2, @town, @postcode, @notes)`,
    )
    .run(input);
  return Number(info.lastInsertRowid);
}

export function customersRouter(db: DB): Router {
  const router = Router();
  router.use(requireUser);

  router.get('/', (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
    const like = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    const rows = db
      .prepare(
        `SELECT c.*,
           (SELECT COUNT(*) FROM enquiries e WHERE e.customer_id = c.id) AS enquiry_count,
           (SELECT COUNT(*) FROM quotes q WHERE q.customer_id = c.id) AS quote_count,
           (SELECT COUNT(*) FROM jobs j WHERE j.customer_id = c.id) AS job_count,
           MAX(c.created_at,
               COALESCE((SELECT MAX(received_at) FROM enquiries e WHERE e.customer_id = c.id), ''),
               COALESCE((SELECT MAX(updated_at) FROM quotes q WHERE q.customer_id = c.id), '')) AS last_activity
         FROM customers c
         WHERE @q = '' OR c.name LIKE @like ESCAPE '\\' OR c.phone LIKE @like ESCAPE '\\'
            OR REPLACE(c.phone, ' ', '') LIKE @likeCompact ESCAPE '\\'
            OR c.email LIKE @like ESCAPE '\\' OR c.postcode LIKE @like ESCAPE '\\'
            OR c.address_line1 LIKE @like ESCAPE '\\' OR c.address_line2 LIKE @like ESCAPE '\\' OR c.town LIKE @like ESCAPE '\\'
         ORDER BY last_activity DESC
         LIMIT 200`,
      )
      .all({ q, like, likeCompact: like.replace(/\s/g, '') });
    res.json(rows);
  });

  router.post('/', (req, res) => {
    const input = validate(customerSchema, req.body);
    const id = insertCustomer(db, input);
    res.status(201).json(db.prepare('SELECT * FROM customers WHERE id = ?').get(id));
  });

  router.get('/:id', (req, res) => {
    const id = idParam(req.params.id);
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
    if (!customer) throw notFound('That customer');

    const enquiries = (
      db.prepare('SELECT * FROM enquiries WHERE customer_id = ? ORDER BY received_at DESC').all(id) as { id: number }[]
    ).map((e) => ({
      ...e,
      photos: (
        db
          .prepare(`SELECT id, file_path, caption FROM attachments WHERE owner_type = 'enquiry' AND owner_id = ? ORDER BY id`)
          .all(e.id) as { id: number; file_path: string; caption: string }[]
      ).map((p) => ({ id: p.id, url: uploadUrl(p.file_path), caption: p.caption })),
    }));

    const quotes = db
      .prepare('SELECT id, ref, title, status, created_at, sent_at, accepted_at FROM quotes WHERE customer_id = ? ORDER BY created_at DESC')
      .all(id);
    const jobs = db
      .prepare('SELECT id, ref, title, status, start_date, created_at FROM jobs WHERE customer_id = ? ORDER BY created_at DESC')
      .all(id);
    const invoices = db
      .prepare(
        'SELECT id, ref, status, issue_date, due_date, total_pence, amount_due_pence FROM invoices WHERE customer_id = ? ORDER BY issue_date DESC',
      )
      .all(id);

    res.json({ customer, enquiries, quotes, jobs, invoices });
  });

  router.put('/:id', (req, res) => {
    const id = idParam(req.params.id);
    if (!db.prepare('SELECT 1 FROM customers WHERE id = ?').get(id)) throw notFound('That customer');
    const input = validate(customerSchema, req.body);
    db.prepare(
      `UPDATE customers SET name = @name, phone = @phone, email = @email, address_line1 = @address_line1,
        address_line2 = @address_line2, town = @town, postcode = @postcode, notes = @notes WHERE id = @id`,
    ).run({ ...input, id });
    res.json(db.prepare('SELECT * FROM customers WHERE id = ?').get(id));
  });

  return router;
}
