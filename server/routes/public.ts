import { Router, type Request, type RequestHandler } from 'express';
import { acceptQuoteSchema, declineQuoteSchema, questionSchema } from '../../shared/schemas';
import type { DB } from '../db/db';
import { HttpError, validate } from '../http';
import type { MessageSender } from '../services/messaging';
import { renderQuotePdf } from '../services/pdf';
import { acceptQuote, askQuestion, declineQuote, publicQuoteView, recordView } from '../services/quotes';
import { publicBaseUrl } from '../services/urls';

/** Light limit on customer actions: 30 per 15 minutes per IP. */
function actionLimiter(): RequestHandler {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (req, _res, next) => {
    const key = req.ip ?? 'unknown';
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.resetAt < now) hits.set(key, { count: 1, resetAt: now + 15 * 60 * 1000 });
    else if (++entry.count > 30) return next(new HttpError(429, 'Too many tries. Please wait a few minutes and try again.'));
    next();
  };
}

const meta = (req: Request) => ({ ip: req.ip, userAgent: req.get('user-agent') });

/** Customer-facing endpoints: no login, the long random token in the link is the key. */
export function publicRouter(db: DB, deps: { sender: MessageSender; uploadsDir: string }): Router {
  const router = Router();
  const limit = actionLimiter();

  router.get('/quotes/:token', (req, res) => {
    const token = String(req.params.token);
    // The owner previewing their own quote (logged in) doesn't count as the customer viewing it.
    if (!req.user && req.query.preview !== '1') recordView(db, token, meta(req));
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ...publicQuoteView(db, token), preview: Boolean(req.user) });
  });

  router.get('/quotes/:token/pdf', async (req, res) => {
    const token = String(req.params.token);
    const view = publicQuoteView(db, token);
    const pdf = await renderQuotePdf(db, token, deps.uploadsDir);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${view.quote.ref}.pdf"`);
    res.send(pdf);
  });

  // A logged-in owner can accept/decline on the customer's behalf (e.g. a "yes" on the phone).
  // The audit trail records that it was the business, not the customer.
  router.post('/quotes/:token/accept', limit, (req, res) => {
    const input = validate(acceptQuoteSchema, req.body);
    acceptQuote(db, deps.sender, String(req.params.token), input, { ...meta(req), byOwner: req.user?.name }, publicBaseUrl(req));
    res.json(publicQuoteView(db, String(req.params.token)));
  });

  router.post('/quotes/:token/decline', limit, (req, res) => {
    const { reason } = validate(declineQuoteSchema, req.body);
    declineQuote(db, deps.sender, String(req.params.token), reason, { ...meta(req), byOwner: req.user?.name }, publicBaseUrl(req));
    res.json(publicQuoteView(db, String(req.params.token)));
  });

  router.post('/quotes/:token/question', limit, (req, res) => {
    if (req.user) throw new HttpError(403, 'This is your own quote. Your customer can ask questions here.');
    const { message } = validate(questionSchema, req.body);
    askQuestion(db, deps.sender, String(req.params.token), message, meta(req), publicBaseUrl(req));
    res.json({ ok: true });
  });

  return router;
}
