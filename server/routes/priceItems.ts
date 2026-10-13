import { Router } from 'express';
import { priceImportSchema, priceItemSchema, reorderSchema } from '../../shared/schemas';
import { requireUser } from '../auth';
import type { DB } from '../db/db';
import { HttpError, idParam, notFound, validate, withBools } from '../http';
import { parsePriceListCsv } from '../services/csv';

type PriceRow = Record<string, unknown> & { id: number; active: number };

export function listPriceItems(db: DB, includeHidden = true) {
  const rows = db
    .prepare(`SELECT * FROM price_items ${includeHidden ? '' : 'WHERE active = 1'} ORDER BY sort_order, id`)
    .all() as PriceRow[];
  return rows.map((r) => withBools(r, ['active']));
}

export function priceItemsRouter(db: DB): Router {
  const router = Router();
  router.use(requireUser);

  const get = (id: number) => {
    const row = db.prepare('SELECT * FROM price_items WHERE id = ?').get(id) as PriceRow | undefined;
    if (!row) throw notFound('That price list item');
    return withBools(row, ['active']);
  };

  router.get('/', (_req, res) => {
    res.json(listPriceItems(db));
  });

  router.post('/', (req, res) => {
    const input = validate(priceItemSchema, req.body);
    const next = (db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM price_items').get() as { n: number }).n;
    const info = db
      .prepare(
        `INSERT INTO price_items (category, name, description, unit, unit_price_pence, kind, rate_bp, active, sort_order)
         VALUES (@category, @name, @description, @unit, @unit_price_pence, @kind, @rate_bp, @active, @sort_order)`,
      )
      .run({ ...input, active: input.active ? 1 : 0, sort_order: next });
    res.status(201).json(get(Number(info.lastInsertRowid)));
  });

  router.put('/:id', (req, res) => {
    const id = idParam(req.params.id);
    get(id);
    const input = validate(priceItemSchema, req.body);
    db.prepare(
      `UPDATE price_items SET category = @category, name = @name, description = @description, unit = @unit,
        unit_price_pence = @unit_price_pence, kind = @kind, rate_bp = @rate_bp, active = @active WHERE id = @id`,
    ).run({ ...input, active: input.active ? 1 : 0, id });
    res.json(get(id));
  });

  // Items are hidden rather than deleted, so old quotes still link to them.
  router.delete('/:id', (req, res) => {
    const id = idParam(req.params.id);
    get(id);
    db.prepare('UPDATE price_items SET active = 0 WHERE id = ?').run(id);
    res.json(get(id));
  });

  router.post('/reorder', (req, res) => {
    const { ids } = validate(reorderSchema, req.body);
    const update = db.prepare('UPDATE price_items SET sort_order = ? WHERE id = ?');
    db.transaction(() => ids.forEach((id, i) => update.run(i + 1, id)))();
    res.json(listPriceItems(db));
  });

  router.post('/import', (req, res) => {
    const { csv, mode, replace } = validate(priceImportSchema, req.body);
    const { rows, error } = parsePriceListCsv(csv);
    if (error) throw new HttpError(400, error);
    const valid = rows.filter((r) => !r.error);
    if (mode === 'preview') {
      res.json({ rows, validCount: valid.length, errorCount: rows.length - valid.length });
      return;
    }
    if (valid.length === 0) throw new HttpError(400, 'There’s nothing to import: every row has a problem.');
    db.transaction(() => {
      if (replace) db.prepare('UPDATE price_items SET active = 0').run();
      let order = (db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS n FROM price_items').get() as { n: number }).n;
      const insert = db.prepare(
        `INSERT INTO price_items (category, name, description, unit, unit_price_pence, sort_order) VALUES (?, ?, ?, ?, ?, ?)`,
      );
      for (const r of valid) insert.run(r.category, r.name, r.description, r.unit, r.unit_price_pence, ++order);
    })();
    res.json({ imported: valid.length, skipped: rows.length - valid.length, items: listPriceItems(db) });
  });

  return router;
}
