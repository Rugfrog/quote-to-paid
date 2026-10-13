import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { parseCsv, parsePriceListCsv } from '../services/csv';
import { takeNextRef } from '../services/numbering';
import { loggedIn, testApp } from './helpers';

describe('login', () => {
  it('blocks the API until you log in', async () => {
    const { app } = testApp();
    const res = await request(app).get('/api/customers');
    expect(res.status).toBe(401);
  });

  it('rejects a wrong password with a friendly message', async () => {
    const { app } = testApp();
    const res = await request(app).post('/api/auth/login').send({ email: 'gary@example.com', password: 'nope' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/don’t match/);
  });

  it('logs in, remembers you, and logs out', async () => {
    const { app } = testApp();
    const agent = await loggedIn(app);
    const me = await agent.get('/api/auth/me');
    expect(me.body.user).toMatchObject({ email: 'gary@example.com', role: 'owner' });
    expect(me.body.user.password_hash).toBeUndefined();
    await agent.post('/api/auth/logout');
    expect((await agent.get('/api/auth/me')).body.user).toBeNull();
    expect((await agent.get('/api/customers')).status).toBe(401);
  });

  it('keeps the agency admin pages for the agency only', async () => {
    const { app } = testApp();
    const owner = await loggedIn(app);
    expect((await owner.get('/api/admin/users')).status).toBe(403);
    const agency = await loggedIn(app, 'admin@example.com', 'agency1234');
    expect((await agency.get('/api/admin/users')).status).toBe(200);
  });
});

describe('business settings', () => {
  it('shows public branding without logging in', async () => {
    const { app } = testApp();
    const res = await request(app).get('/api/business/public');
    expect(res.body).toMatchObject({ name: 'Holme Valley Plastering & Building', brand_colour: '#2d6a4f' });
    expect(res.body.account_number).toBeUndefined();
  });

  it('saves changes and tidies the input', async () => {
    const { app } = testApp();
    const agent = await loggedIn(app);
    const res = await agent.put('/api/business').send({ postcode: 'hd12ab', sort_code: '112233', vat_registered: false });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ postcode: 'HD1 2AB', sort_code: '11-22-33', vat_registered: false });
  });

  it('rejects bad input field by field', async () => {
    const { app } = testApp();
    const agent = await loggedIn(app);
    const res = await agent.put('/api/business').send({ brand_colour: 'blue', postcode: 'nowhere', account_number: '12' });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.fields).sort()).toEqual(['account_number', 'brand_colour', 'postcode']);
  });
});

describe('document numbers', () => {
  it('counts up with the prefix and never reuses a number', () => {
    const { db } = testApp();
    expect(takeNextRef(db, 'quote')).toEqual({ number: 1, ref: 'Q-0001' });
    expect(takeNextRef(db, 'quote')).toEqual({ number: 2, ref: 'Q-0002' });
    db.prepare(`UPDATE business SET invoice_prefix = 'HV-', invoice_next = 250`).run();
    expect(takeNextRef(db, 'invoice').ref).toBe('HV-0250');
  });

  it('won’t let the starting number go below one already used', async () => {
    const { app, db } = testApp();
    const agent = await loggedIn(app);
    db.prepare(
      `INSERT INTO quotes (number, ref, customer_id, public_token) VALUES (5, 'Q-0005', 1, 'tok-a')`,
    ).run();
    const res = await agent.put('/api/business').send({ quote_next: 3 });
    expect(res.status).toBe(400);
    expect(res.body.fields.quote_next).toMatch(/6 or more/);
  });
});

describe('price list', () => {
  it('lists the seeded items and adds a new one', async () => {
    const { app } = testApp();
    const agent = await loggedIn(app);
    const list = await agent.get('/api/price-items');
    expect(list.body.length).toBeGreaterThanOrEqual(25);
    const created = await agent.post('/api/price-items').send({
      category: 'Plastering',
      name: 'Bonding coat',
      unit: 'm2',
      unit_price_pence: 1650,
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: 'Bonding coat', unit_price_pence: 1650, active: true });
  });

  it('hides rather than deletes', async () => {
    const { app } = testApp();
    const agent = await loggedIn(app);
    const res = await agent.delete('/api/price-items/1');
    expect(res.body.active).toBe(false);
  });

  it('previews then imports a CSV', async () => {
    const { app } = testApp();
    const agent = await loggedIn(app);
    const csv = 'Category,Name,Unit,Price\nPlastering,"Skim, small room",each,"£350.00"\nWaste,Bulk bag,each,abc\n';
    const preview = await agent.post('/api/price-items/import').send({ csv, mode: 'preview' });
    expect(preview.body).toMatchObject({ validCount: 1, errorCount: 1 });
    const done = await agent.post('/api/price-items/import').send({ csv, mode: 'import' });
    expect(done.body.imported).toBe(1);
    expect(done.body.items.some((i: { name: string }) => i.name === 'Skim, small room')).toBe(true);
  });
});

describe('CSV parsing', () => {
  it('handles quotes, commas and Excel line endings', () => {
    expect(parseCsv('a,"b, c","d ""e"""\r\n1,2,3')).toEqual([
      ['a', 'b, c', 'd "e"'],
      ['1', '2', '3'],
    ]);
  });

  it('understands common unit names', () => {
    const { rows } = parsePriceListCsv('name,unit,price\nSkim,sqm,12\nCoving,metre,14\nDay,days,220\nOdd,bucket,1');
    expect(rows.map((r) => r.unit)).toEqual(['m2', 'm', 'day', '']);
    expect(rows[3].error).toMatch(/not recognised/);
  });

  it('explains a missing header', () => {
    expect(parsePriceListCsv('foo,bar\n1,2').error).toMatch(/name.*unit.*price/);
  });
});

describe('customers and enquiries', () => {
  it('searches customers by name, postcode and phone', async () => {
    const { app } = testApp();
    const agent = await loggedIn(app);
    expect((await agent.get('/api/customers?q=hirst')).body[0].name).toBe('Susan Hirst');
    expect((await agent.get('/api/customers?q=HD7 6BW')).body[0].name).toBe('Rachel Brook');
    expect((await agent.get('/api/customers?q=07700900208')).body[0].name).toBe('Imran Hussain');
    expect((await agent.get('/api/customers')).body.length).toBe(12);
  });

  it('adds an enquiry with a brand-new customer in one go', async () => {
    const { app } = testApp();
    const agent = await loggedIn(app);
    const res = await agent.post('/api/enquiries').send({
      customer: { name: 'Jo Bailey', phone: '07700900300', postcode: 'hd4 5aa' },
      description: 'Skim the lounge ceiling',
      source: 'phone',
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ customer_name: 'Jo Bailey', status: 'new' });
    const detail = await agent.get(`/api/customers/${res.body.customer_id}`);
    expect(detail.body.customer).toMatchObject({ phone: '07700 900300', postcode: 'HD4 5AA' });
    expect(detail.body.enquiries).toHaveLength(1);
  });

  it('needs either an existing customer or a new one', async () => {
    const { app } = testApp();
    const agent = await loggedIn(app);
    const res = await agent.post('/api/enquiries').send({ description: 'Something' });
    expect(res.status).toBe(400);
    expect(res.body.fields.customer_id).toBeDefined();
  });

  it('attaches photos to an enquiry', async () => {
    const { app } = testApp();
    const agent = await loggedIn(app);
    // A 1×1 PNG
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
    const res = await agent.post('/api/enquiries/1/photos').attach('photos', png, { filename: 'wall.png', contentType: 'image/png' });
    expect(res.status).toBe(201);
    expect(res.body.photos).toHaveLength(1);
    const img = await request(app).get(res.body.photos[0].url);
    expect(img.status).toBe(200);
  });

  it('refuses files that aren’t photos', async () => {
    const { app } = testApp();
    const agent = await loggedIn(app);
    const res = await agent
      .post('/api/enquiries/1/photos')
      .attach('photos', Buffer.from('<svg onload="alert(1)"/>'), { filename: 'x.svg', contentType: 'image/svg+xml' });
    expect(res.status).toBe(400);
  });
});
