import { Router } from 'express';
import { businessUpdateSchema } from '../../shared/schemas';
import { requireUser } from '../auth';
import { bool, nowIso, type DB } from '../db/db';
import { HttpError, validate, withBools } from '../http';
import { minimumNext, type DocKind } from '../services/numbering';
import { deleteUpload, imageUpload, uploadUrl } from '../uploads';

export function getBusiness(db: DB) {
  const row = db.prepare('SELECT * FROM business WHERE id = 1').get() as Record<string, unknown> | undefined;
  if (!row) throw new HttpError(500, 'The business hasn’t been set up yet. Run `npm run seed`.');
  return row;
}

export function businessDto(row: Record<string, unknown>) {
  return { ...withBools(row, ['vat_registered', 'reminders_default_on']), logo_url: uploadUrl(row.logo_path as string) };
}

/** The bits customers and the login page are allowed to see. */
export function publicBranding(row: Record<string, unknown>) {
  return {
    name: row.name,
    brand_colour: row.brand_colour,
    logo_url: uploadUrl(row.logo_path as string),
    phone: row.phone,
    email: row.email,
  };
}

export function businessRouter(db: DB, uploadsDir?: string): Router {
  const router = Router();
  const upload = imageUpload(uploadsDir);

  router.get('/public', (_req, res) => {
    res.json(publicBranding(getBusiness(db)));
  });

  router.use(requireUser);

  router.get('/', (_req, res) => {
    const kinds: DocKind[] = ['quote', 'job', 'invoice'];
    const minimums = Object.fromEntries(kinds.map((k) => [`${k}_next_min`, minimumNext(db, k)]));
    res.json({ ...businessDto(getBusiness(db)), ...minimums });
  });

  router.put('/', (req, res) => {
    const input = validate(businessUpdateSchema, req.body);
    // Starting numbers can't go below what's already been used.
    for (const kind of ['quote', 'job', 'invoice'] as DocKind[]) {
      const value = input[`${kind}_next`];
      const min = minimumNext(db, kind);
      if (value !== undefined && value < min) {
        throw new HttpError(400, 'Please check the highlighted fields.', {
          [`${kind}_next`]: `Must be ${min} or more: numbers up to ${min - 1} are already used`,
        });
      }
    }
    const values: Record<string, unknown> = {
      ...input,
      vat_registered: bool(input.vat_registered),
      reminders_default_on: bool(input.reminders_default_on),
    };
    const keys = Object.keys(values).filter((k) => values[k] !== undefined);
    if (keys.length > 0) {
      db.prepare(`UPDATE business SET ${keys.map((k) => `${k} = @${k}`).join(', ')}, updated_at = @updated_at WHERE id = 1`).run(
        { ...Object.fromEntries(keys.map((k) => [k, values[k]])), updated_at: nowIso() },
      );
    }
    res.json(businessDto(getBusiness(db)));
  });

  router.post('/logo', upload.single('logo'), (req, res) => {
    if (!req.file) throw new HttpError(400, 'Please choose a logo image.');
    const old = getBusiness(db).logo_path as string | null;
    db.prepare('UPDATE business SET logo_path = ?, updated_at = ? WHERE id = 1').run(req.file.filename, nowIso());
    deleteUpload(old, uploadsDir);
    res.json(businessDto(getBusiness(db)));
  });

  router.delete('/logo', (_req, res) => {
    const old = getBusiness(db).logo_path as string | null;
    db.prepare('UPDATE business SET logo_path = NULL, updated_at = ? WHERE id = 1').run(nowIso());
    deleteUpload(old, uploadsDir);
    res.json(businessDto(getBusiness(db)));
  });

  return router;
}
