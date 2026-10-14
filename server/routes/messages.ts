import { Router } from 'express';
import { templateSchema } from '../../shared/schemas';
import { requireUser } from '../auth';
import { nowIso, type DB } from '../db/db';
import { notFound, validate } from '../http';

/** Outbox (simulated emails/texts), owner notifications and editable message templates. */
export function messagesRouter(db: DB): Router {
  const router = Router();
  router.use(requireUser);

  router.get('/outbox', (_req, res) => {
    const rows = (db.prepare('SELECT * FROM outbox ORDER BY id DESC LIMIT 200').all() as { links: string }[]).map((r) => ({
      ...r,
      links: JSON.parse(r.links),
    }));
    res.json(rows);
  });

  router.get('/notifications', (_req, res) => {
    const items = db.prepare('SELECT * FROM notifications ORDER BY id DESC LIMIT 50').all();
    const unread = (db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE read_at IS NULL').get() as { n: number }).n;
    res.json({ items, unread });
  });

  router.post('/notifications/read', (_req, res) => {
    db.prepare('UPDATE notifications SET read_at = ? WHERE read_at IS NULL').run(nowIso());
    res.json({ ok: true });
  });

  router.get('/templates', (_req, res) => {
    res.json(db.prepare('SELECT * FROM message_templates ORDER BY rowid').all());
  });

  router.put('/templates/:key', (req, res) => {
    const key = String(req.params.key);
    if (!db.prepare('SELECT 1 FROM message_templates WHERE key = ?').get(key)) throw notFound('That message');
    const { subject, body } = validate(templateSchema, req.body);
    db.prepare('UPDATE message_templates SET subject = ?, body = ? WHERE key = ?').run(subject, body, key);
    res.json(db.prepare('SELECT * FROM message_templates WHERE key = ?').get(key));
  });

  return router;
}
