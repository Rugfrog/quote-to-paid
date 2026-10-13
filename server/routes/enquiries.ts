import { Router } from 'express';
import { enquirySchema, enquiryUpdateSchema } from '../../shared/schemas';
import { requireUser } from '../auth';
import type { DB } from '../db/db';
import { HttpError, idParam, notFound, validate } from '../http';
import { deleteUpload, imageUpload, uploadUrl } from '../uploads';
import { insertCustomer } from './customers';

export function enquiriesRouter(db: DB, uploadsDir?: string): Router {
  const router = Router();
  const upload = imageUpload(uploadsDir);
  router.use(requireUser);

  const get = (id: number) => {
    const row = db
      .prepare(
        `SELECT e.*, c.name AS customer_name, c.phone AS customer_phone, c.postcode AS customer_postcode
         FROM enquiries e JOIN customers c ON c.id = e.customer_id WHERE e.id = ?`,
      )
      .get(id) as Record<string, unknown> | undefined;
    if (!row) throw notFound('That enquiry');
    const photos = (
      db
        .prepare(`SELECT id, file_path, caption FROM attachments WHERE owner_type = 'enquiry' AND owner_id = ? ORDER BY id`)
        .all(id) as { id: number; file_path: string; caption: string }[]
    ).map((p) => ({ id: p.id, url: uploadUrl(p.file_path), caption: p.caption }));
    return { ...row, photos };
  };

  router.get('/', (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : '';
    const rows = db
      .prepare(
        `SELECT e.*, c.name AS customer_name, c.town AS customer_town,
           (SELECT COUNT(*) FROM attachments a WHERE a.owner_type = 'enquiry' AND a.owner_id = e.id) AS photo_count
         FROM enquiries e JOIN customers c ON c.id = e.customer_id
         WHERE @status = '' OR e.status = @status
         ORDER BY e.received_at DESC LIMIT 100`,
      )
      .all({ status });
    res.json(rows);
  });

  router.get('/:id', (req, res) => {
    res.json(get(idParam(req.params.id)));
  });

  // Creates the customer too if a new one was typed in, all in one go.
  router.post('/', (req, res) => {
    const input = validate(enquirySchema, req.body);
    const id = db.transaction(() => {
      let customerId = input.customer_id;
      if (customerId !== undefined) {
        if (!db.prepare('SELECT 1 FROM customers WHERE id = ?').get(customerId)) throw notFound('That customer');
      } else {
        customerId = insertCustomer(db, input.customer!);
      }
      const info = db
        .prepare('INSERT INTO enquiries (customer_id, description, source) VALUES (?, ?, ?)')
        .run(customerId, input.description, input.source);
      return Number(info.lastInsertRowid);
    })();
    res.status(201).json(get(id));
  });

  router.put('/:id', (req, res) => {
    const id = idParam(req.params.id);
    get(id);
    const input = validate(enquiryUpdateSchema, req.body);
    const keys = Object.keys(input).filter((k) => input[k as keyof typeof input] !== undefined);
    if (keys.length) {
      db.prepare(`UPDATE enquiries SET ${keys.map((k) => `${k} = @${k}`).join(', ')} WHERE id = @id`).run({ ...input, id });
    }
    res.json(get(id));
  });

  router.post('/:id/photos', upload.array('photos', 10), (req, res) => {
    const id = idParam(req.params.id);
    get(id);
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) throw new HttpError(400, 'Please choose at least one photo.');
    const insert = db.prepare(
      `INSERT INTO attachments (owner_type, owner_id, kind, file_path, mime, size_bytes) VALUES ('enquiry', ?, 'photo', ?, ?, ?)`,
    );
    db.transaction(() => files.forEach((f) => insert.run(id, f.filename, f.mimetype, f.size)))();
    res.status(201).json(get(id));
  });

  router.delete('/:id/photos/:photoId', (req, res) => {
    const id = idParam(req.params.id);
    const photoId = idParam(req.params.photoId);
    const photo = db
      .prepare(`SELECT file_path FROM attachments WHERE id = ? AND owner_type = 'enquiry' AND owner_id = ?`)
      .get(photoId, id) as { file_path: string } | undefined;
    if (!photo) throw notFound('That photo');
    db.prepare('DELETE FROM attachments WHERE id = ?').run(photoId);
    deleteUpload(photo.file_path, uploadsDir);
    res.json(get(id));
  });

  return router;
}
