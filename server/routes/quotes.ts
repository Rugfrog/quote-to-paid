import { Router } from 'express';
import path from 'node:path';
import { aiFillSchema, quoteCreateSchema, quoteSaveSchema, replySchema } from '../../shared/schemas';
import { requireUser } from '../auth';
import { nowIso, type DB } from '../db/db';
import { HttpError, idParam, validate } from '../http';
import type { QuoteAi } from '../services/ai';
import type { PriceListItem } from '../services/ai/suggestion';
import type { MessageSender } from '../services/messaging';
import { renderQuotePdf } from '../services/pdf';
import {
  appendSuggestion,
  createQuote,
  deleteDraft,
  getQuoteDetail,
  listQuotes,
  nudgeQuote,
  photoFilesForAi,
  replyToCustomer,
  saveQuote,
  sendQuote,
} from '../services/quotes';
import { publicBaseUrl } from '../services/urls';
import { imageUpload } from '../uploads';

export function quotesRouter(db: DB, deps: { sender: MessageSender; ai: QuoteAi; uploadsDir: string }): Router {
  const router = Router();
  const upload = imageUpload(deps.uploadsDir);
  router.use(requireUser);

  router.get('/', (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : '';
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
    const customerId = Number(req.query.customer) || 0;
    res.json(listQuotes(db, { status, q, customerId }));
  });

  // Before '/:id' so it isn't read as a quote id.
  router.get('/ai-status', (_req, res) => {
    res.json({ mode: deps.ai.enabled ? 'claude' : 'demo' });
  });

  router.post('/', (req, res) => {
    const input = validate(quoteCreateSchema, req.body);
    const id = createQuote(db, input);
    res.status(201).json(getQuoteDetail(db, id));
  });

  router.get('/:id', (req, res) => {
    res.json(getQuoteDetail(db, idParam(req.params.id)));
  });

  router.put('/:id', (req, res) => {
    const id = idParam(req.params.id);
    saveQuote(db, id, validate(quoteSaveSchema, req.body));
    res.json(getQuoteDetail(db, id));
  });

  router.delete('/:id', (req, res) => {
    deleteDraft(db, idParam(req.params.id));
    res.json({ ok: true });
  });

  router.post('/:id/photos', upload.array('photos', 10), (req, res) => {
    const id = idParam(req.params.id);
    getQuoteDetail(db, id); // 404 if missing
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) throw new HttpError(400, 'Please choose at least one photo.');
    const insert = db.prepare(
      `INSERT INTO attachments (owner_type, owner_id, kind, file_path, mime, size_bytes) VALUES ('quote', ?, 'photo', ?, ?, ?)`,
    );
    db.transaction(() => files.forEach((f) => insert.run(id, f.filename, f.mimetype, f.size)))();
    res.status(201).json(getQuoteDetail(db, id));
  });

  /** Ask the AI (or the demo estimator) for lines and add them to the quote. */
  router.post('/:id/ai-fill', async (req, res) => {
    const id = idParam(req.params.id);
    const { brief } = validate(aiFillSchema, req.body);
    if (brief !== undefined) db.prepare('UPDATE quotes SET brief = ?, updated_at = ? WHERE id = ?').run(brief, nowIso(), id);
    const detail = getQuoteDetail(db, id);
    if (!detail.quote.editable) throw new HttpError(409, 'This quote can no longer be changed.');
    const photos = photoFilesForAi(db, id);
    if (!detail.quote.brief.trim() && photos.length === 0) {
      throw new HttpError(400, 'Describe the job, record a voice note or add a photo first.');
    }

    const business = db.prepare('SELECT name, trade FROM business WHERE id = 1').get() as { name: string; trade: string };
    const priceList = db.prepare('SELECT * FROM price_items ORDER BY sort_order, id').all() as PriceListItem[];
    const result = await deps.ai.suggest({
      brief: detail.quote.brief,
      trade: business.trade,
      businessName: business.name,
      priceList,
      photoPaths: photos.map((p) => path.join(deps.uploadsDir, path.basename(p.file_path))),
    });
    appendSuggestion(db, id, result.suggestion);
    res.json({
      ...getQuoteDetail(db, id),
      ai: {
        mode: result.mode,
        notice: result.notice ?? null,
        assumptions: result.suggestion.assumptions,
        added: result.suggestion.lines.length,
        flagged: result.suggestion.lines.filter((l) => l.unit_price_pence === null).length,
      },
    });
  });

  router.post('/:id/send', (req, res) => {
    const id = idParam(req.params.id);
    const sent = sendQuote(db, deps.sender, id, publicBaseUrl(req));
    res.json({ ...getQuoteDetail(db, id), sent });
  });

  router.post('/:id/nudge', (req, res) => {
    const id = idParam(req.params.id);
    const sent = nudgeQuote(db, deps.sender, id, publicBaseUrl(req));
    res.json({ ...getQuoteDetail(db, id), sent });
  });

  router.post('/:id/reply', (req, res) => {
    const id = idParam(req.params.id);
    const { body } = validate(replySchema, req.body);
    replyToCustomer(db, deps.sender, id, body, publicBaseUrl(req));
    res.json(getQuoteDetail(db, id));
  });

  router.get('/:id/pdf', async (req, res) => {
    const detail = getQuoteDetail(db, idParam(req.params.id));
    const pdf = await renderQuotePdf(db, detail.quote.public_token, deps.uploadsDir);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${detail.quote.ref}.pdf"`);
    res.send(pdf);
  });

  return router;
}
