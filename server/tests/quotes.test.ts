import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { openDb } from '../db/db';
import { seedDemo } from '../db/seed';
import { createQuoteAi } from '../services/ai';
import { expireQuotes } from '../services/quotes';
import { loggedIn, testApp } from './helpers';

const line = (description: string, quantity_x100: number, unit_price_pence: number | null, unit = 'm2') => ({
  description,
  quantity_x100,
  unit,
  unit_price_pence,
  price_item_id: null,
  needs_price: unit_price_pence === null,
});

const content = (lines: ReturnType<typeof line>[], extra: Record<string, unknown> = {}) => ({
  title: 'Re-plaster back bedroom',
  intro_notes: 'Thanks for having us round.',
  exclusions: ['Decorating'],
  validity_days: 30,
  deposit_bp: 2500,
  options: [{ name: '', recommended: false, lines }],
  ...extra,
});

async function draftQuote(agent: Awaited<ReturnType<typeof loggedIn>>, customer_id = 1) {
  const res = await agent.post('/api/quotes').send({ customer_id, enquiry_id: 1, source: 'text', brief: 'Re-plaster the back bedroom' });
  expect(res.status).toBe(201);
  return res.body.quote as { id: number; ref: string; public_token: string };
}

describe('creating and saving quotes', () => {
  it('numbers quotes, copies VAT and defaults from the business, and titles from the brief', async () => {
    const { app } = testApp();
    const agent = await loggedIn(app);
    const res = await agent.post('/api/quotes').send({ customer_id: 1, enquiry_id: 1, source: 'voice', brief: 'Re-plaster the back bedroom, about 4 by 3' });
    expect(res.body.quote).toMatchObject({
      ref: 'Q-0001',
      status: 'draft',
      title: 'Re-plaster the back bedroom',
      vat_registered: true,
      vat_rate_bp: 2000,
      validity_days: 30,
      deposit_bp: 2500,
      editable: true,
    });
    expect(res.body.quote.public_token).toHaveLength(43);
    expect((await agent.post('/api/quotes').send({ customer_id: 2 })).body.quote.ref).toBe('Q-0002');
  });

  it('works out totals on the server the same way as on screen', async () => {
    const { app } = testApp();
    const agent = await loggedIn(app);
    const q = await draftQuote(agent);
    const res = await agent.put(`/api/quotes/${q.id}`).send(
      content([line('Re-plaster walls', 3360, 3200), line('Ceiling skim', 1200, 1500), line('Protection', 100, 4500, 'item')]),
    );
    expect(res.status).toBe(200);
    const totals = res.body.options[0].totals;
    // 1075.20 + 180.00 + 45.00 = 1300.20; VAT 260.04; total 1560.24; deposit 25% = 390.06
    expect(totals).toMatchObject({ subtotalPence: 130020, vatPence: 26004, totalPence: 156024, depositPence: 39006, unpricedLines: 0 });
    expect(res.body.options[0].lines[0].line_total_pence).toBe(107520);
  });

  it('supports good / better / best options with one recommended', async () => {
    const { app } = testApp();
    const agent = await loggedIn(app);
    const q = await draftQuote(agent);
    const res = await agent.put(`/api/quotes/${q.id}`).send(
      content([], {
        options: [
          { name: 'Patch repair', recommended: false, lines: [line('Patch', 200, 8500, 'each')] },
          { name: 'Full re-plaster', recommended: true, lines: [line('Re-plaster', 3360, 3200)] },
          { name: 'Re-plaster and coving', recommended: true, lines: [line('Re-plaster', 3360, 3200), line('Coving', 1400, 1400, 'm')] },
        ],
      }),
    );
    expect(res.body.options.map((o: { recommended: boolean }) => o.recommended)).toEqual([false, true, false]);
    const list = await agent.get('/api/quotes');
    expect(list.body[0]).toMatchObject({ option_count: 3, total_pence: 129024 }); // recommended option: 1075.20 + VAT
  });

  it('keeps "check price" lines out of the totals and refuses to send until priced', async () => {
    const { app } = testApp();
    const agent = await loggedIn(app);
    const q = await draftQuote(agent);
    const saved = await agent.put(`/api/quotes/${q.id}`).send(content([line('Skim', 1000, 1200), line('Replace lintel', 100, null, 'each')]));
    expect(saved.body.options[0].totals).toMatchObject({ subtotalPence: 12000, unpricedLines: 1 });
    const send = await agent.post(`/api/quotes/${q.id}/send`);
    expect(send.status).toBe(400);
    expect(send.body.error).toMatch(/1 line needs a price/);
  });

  it('rejects a priced line with no price and other bad input', async () => {
    const { app } = testApp();
    const agent = await loggedIn(app);
    const q = await draftQuote(agent);
    const res = await agent.put(`/api/quotes/${q.id}`).send(content([{ ...line('Skim', 0, null), needs_price: false }]));
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.fields)).toEqual(expect.arrayContaining(['options.0.lines.0.quantity_x100', 'options.0.lines.0.unit_price_pence']));
  });

  it('only lets you delete drafts', async () => {
    const { app } = testApp();
    const agent = await loggedIn(app);
    const q = await draftQuote(agent);
    await agent.put(`/api/quotes/${q.id}`).send(content([line('Skim', 1000, 1200)]));
    await agent.post(`/api/quotes/${q.id}/send`);
    expect((await agent.delete(`/api/quotes/${q.id}`)).status).toBe(409);
  });
});

describe('the AI fill endpoint', () => {
  it('adds priced lines from the demo estimator and keeps what you typed', async () => {
    const { app } = testApp();
    const agent = await loggedIn(app);
    const q = await draftQuote(agent);
    const res = await agent.post(`/api/quotes/${q.id}/ai-fill`).send({ brief: 'Re-plaster the back bedroom, about 4 by 3 metres, skim the ceiling too' });
    expect(res.status).toBe(200);
    expect(res.body.ai).toMatchObject({ mode: 'demo', flagged: 0 });
    expect(res.body.quote.brief).toMatch(/4 by 3 metres/);
    expect(res.body.options[0].lines.length).toBeGreaterThanOrEqual(4);
    expect(res.body.quote.exclusions.join(' ')).toMatch(/Decorating/);
  });

  it('falls back gracefully when the AI fails', async () => {
    const { db, uploadsDir } = testApp();
    const ai = createQuoteAi({ estimate: async () => Promise.reject(new Error('boom')) });
    const app = createApp(db, { uploadsDir, ai });
    const agent = await loggedIn(app);
    const q = await draftQuote(agent);
    const res = await agent.post(`/api/quotes/${q.id}/ai-fill`).send({ brief: 'Skim the lounge ceiling' });
    expect(res.status).toBe(200);
    expect(res.body.ai.mode).toBe('demo');
    expect(res.body.ai.notice).toMatch(/didn’t respond/);
  });

  it('asks for something to go on', async () => {
    const { app } = testApp();
    const agent = await loggedIn(app);
    const q = await draftQuote(agent);
    const res = await agent.post(`/api/quotes/${q.id}/ai-fill`).send({ brief: '' });
    expect(res.status).toBe(400);
  });
});

describe('sending, viewing and accepting (the customer journey)', () => {
  async function sentQuote() {
    const t = testApp();
    const agent = await loggedIn(t.app);
    const q = await draftQuote(agent);
    await agent.put(`/api/quotes/${q.id}`).send(content([line('Re-plaster walls', 3360, 3200)]));
    const sent = await agent.post(`/api/quotes/${q.id}/send`);
    expect(sent.status).toBe(200);
    return { ...t, agent, q, sent: sent.body };
  }

  it('sends by email with a link and records it in the outbox', async () => {
    const { agent, q, sent } = await sentQuote();
    expect(sent.quote.status).toBe('sent');
    expect(sent.sent).toMatchObject({ channel: 'email', address: 'susan.hirst@example.com' });
    const outbox = await agent.get('/api/outbox');
    expect(outbox.body[0]).toMatchObject({ channel: 'email', to_name: 'Susan Hirst', subject: `Your quote from Holme Valley Plastering & Building (${q.ref})` });
    expect(outbox.body[0].body).toContain(`/q/${q.public_token}`);
    expect(outbox.body[0].body).toContain('Hi Susan');
    expect(outbox.body[0].body).toContain('£1,290.24');
  });

  it('texts customers who have no email', async () => {
    const { app } = testApp();
    const agent = await loggedIn(app);
    const q = await draftQuote(agent, 7).catch(async () => {
      const r = await agent.post('/api/quotes').send({ customer_id: 7 }); // Margaret: no email
      return r.body.quote;
    });
    await agent.put(`/api/quotes/${q.id}`).send(content([line('Patch', 200, 8500, 'each')]));
    const res = await agent.post(`/api/quotes/${q.id}/send`);
    expect(res.body.sent).toMatchObject({ channel: 'sms', address: '07700 900207' });
  });

  it('records the customer opening the link, but not the owner previewing it', async () => {
    const { app, agent, q } = await sentQuote();
    await agent.get(`/api/public/quotes/${q.public_token}`); // owner, logged in
    expect((await agent.get(`/api/quotes/${q.id}`)).body.quote.status).toBe('sent');
    const view = await request(app).get(`/api/public/quotes/${q.public_token}`); // customer
    expect(view.status).toBe(200);
    expect(view.body.quote.brief).toBeUndefined(); // private notes never reach the customer
    const detail = await agent.get(`/api/quotes/${q.id}`);
    expect(detail.body.quote.status).toBe('viewed');
    expect(detail.body.quote.first_viewed_at).toBeTruthy();
    expect((await agent.get('/api/notifications')).body.items[0].title).toMatch(/opened Q-0001/);
  });

  it('accepts with a typed name and tick, keeps an audit trail, and tells the owner', async () => {
    const { app, agent, q } = await sentQuote();
    const noTick = await request(app).post(`/api/public/quotes/${q.public_token}/accept`).send({ name: 'Susan Hirst', agreed: false });
    expect(noTick.status).toBe(400);
    const res = await request(app)
      .post(`/api/public/quotes/${q.public_token}/accept`)
      .set('User-Agent', 'Test phone')
      .send({ name: 'Susan Hirst', agreed: true });
    expect(res.status).toBe(200);
    expect(res.body.quote).toMatchObject({ status: 'accepted', accepted_name: 'Susan Hirst' });

    const detail = (await agent.get(`/api/quotes/${q.id}`)).body;
    const accepted = detail.events.find((e: { type: string }) => e.type === 'accepted');
    expect(accepted).toMatchObject({ actor: 'customer', user_agent: 'Test phone', detail: { name: 'Susan Hirst', agreed_to_terms: true } });
    expect(detail.quote.editable).toBe(false);
    expect((await agent.get('/api/notifications')).body.items[0].title).toBe('Susan Hirst accepted Q-0001');
    const outbox = (await agent.get('/api/outbox')).body;
    expect(outbox[0]).toMatchObject({ to_address: 'holmevalleyplastering@example.com', subject: 'Susan Hirst accepted Q-0001' });

    // Can't accept twice, or edit afterwards
    expect((await request(app).post(`/api/public/quotes/${q.public_token}/accept`).send({ name: 'X', agreed: true })).status).toBe(409);
    expect((await agent.put(`/api/quotes/${q.id}`).send(content([line('Skim', 100, 100)]))).status).toBe(409);
  });

  it('records it when the owner accepts on the customer’s behalf', async () => {
    const { agent, q } = await sentQuote();
    await agent.post(`/api/public/quotes/${q.public_token}/accept`).send({ name: 'Susan Hirst', agreed: true });
    const detail = (await agent.get(`/api/quotes/${q.id}`)).body;
    expect(detail.events.find((e: { type: string }) => e.type === 'accepted')).toMatchObject({
      actor: 'owner',
      detail: { on_behalf_of_customer: true, recorded_by: 'Gary Firth' },
    });
  });

  it('lets the customer decline or ask a question', async () => {
    const { app, agent, q } = await sentQuote();
    const ask = await request(app).post(`/api/public/quotes/${q.public_token}/question`).send({ message: 'Can you start in March?' });
    expect(ask.status).toBe(200);
    const detail = (await agent.get(`/api/quotes/${q.id}`)).body;
    expect(detail.messages[0]).toMatchObject({ sender: 'customer', body: 'Can you start in March?' });

    await agent.post(`/api/quotes/${q.id}/reply`).send({ body: 'Yes, first week of March works.' });
    expect((await agent.get('/api/outbox')).body[0]).toMatchObject({ to_address: 'susan.hirst@example.com', subject: 'Re: your quote Q-0001' });

    const decline = await request(app).post(`/api/public/quotes/${q.public_token}/decline`).send({ reason: 'Gone with someone else' });
    expect(decline.body.quote.status).toBe('declined');
  });

  it('expires quotes after their valid-until date', async () => {
    const { app, db, q } = await sentQuote();
    expireQuotes(db, '2999-01-01');
    const res = await request(app).post(`/api/public/quotes/${q.public_token}/accept`).send({ name: 'Susan', agreed: true });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/expired/);
  });

  it('nudges a quote that’s waiting for an answer', async () => {
    const { agent, q } = await sentQuote();
    const res = await agent.post(`/api/quotes/${q.id}/nudge`);
    expect(res.status).toBe(200);
    expect((await agent.get('/api/outbox')).body[0].subject).toMatch(/Just checking in/);
  });

  it('turns away made-up links', async () => {
    const { app } = testApp();
    expect((await request(app).get('/api/public/quotes/not-a-real-token-at-all-xxxxxxxx')).status).toBe(404);
    // Path tricks get normalised away to an address that needs a login: refused either way.
    expect([401, 404]).toContain((await request(app).get('/api/public/quotes/../../etc')).status);
  });

  it('makes a PDF', async () => {
    const { app, q } = await sentQuote();
    const pdf = await request(app).get(`/api/public/quotes/${q.public_token}/pdf`).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
  });
});

describe('demo data', () => {
  it('seeds quotes at every stage with consistent totals and back-dated history', async () => {
    const db = openDb(':memory:');
    seedDemo(db, { fastHash: true });
    const app = createApp(db, { uploadsDir: testApp().uploadsDir });
    const agent = await loggedIn(app);
    const quotes = (await agent.get('/api/quotes')).body as { id: number; status: string; total_pence: number; option_count: number; needs_price: boolean }[];
    const statuses = new Set(quotes.map((q) => q.status));
    for (const s of ['draft', 'sent', 'viewed', 'accepted', 'declined']) expect(statuses.has(s), s).toBe(true);
    expect(quotes.some((q) => q.option_count === 3)).toBe(true);
    expect(quotes.find((q) => q.status === 'draft')?.needs_price).toBe(true);
    for (const q of quotes) {
      const d = (await agent.get(`/api/quotes/${q.id}`)).body;
      for (const o of d.options) expect(o.totals.totalPence).toBe(o.totals.subtotalPence + o.totals.vatPence);
      expect(new Date(d.quote.created_at).getTime()).toBeLessThan(Date.now());
    }
    const outbox = (await agent.get('/api/outbox')).body as { created_at: string }[];
    expect(outbox.length).toBeGreaterThan(8);
  });
});

describe('message templates', () => {
  it('can be edited and are used for the next message', async () => {
    const { app } = testApp();
    const agent = await loggedIn(app);
    const res = await agent.put('/api/templates/quote_sent').send({ subject: 'Your price for {{title}}', body: 'Hiya {{customer_first_name}} {{link}}' });
    expect(res.status).toBe(200);
    const q = await draftQuote(agent);
    await agent.put(`/api/quotes/${q.id}`).send(content([line('Skim', 1000, 1200)]));
    await agent.post(`/api/quotes/${q.id}/send`);
    const sent = (await agent.get('/api/outbox')).body[0];
    expect(sent.subject).toBe('Your price for re-plaster back bedroom');
    expect(sent.body).toMatch(/^Hiya Susan http/);
  });
});
