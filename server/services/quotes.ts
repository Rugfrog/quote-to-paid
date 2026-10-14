import { addDays, formatDateLong, formatMoney, isoDate } from '../../shared/format';
import { calculateTotals, depositAmount, lineTotal, type Totals } from '../../shared/money';
import type { QuoteSaveInput } from '../../shared/schemas';
import { nowIso, type DB } from '../db/db';
import { HttpError, notFound } from '../http';
import { uploadUrl } from '../uploads';
import {
  businessVars,
  emailOwner,
  firstName,
  NoContactDetailsError,
  notifyOwner,
  sendTemplate,
  type MessageSender,
} from './messaging';
import { takeNextRef } from './numbering';
import { newToken } from './tokens';
import { quoteLink } from './urls';

export type QuoteStatus = 'draft' | 'sent' | 'viewed' | 'accepted' | 'declined' | 'expired';

export interface QuoteRow {
  id: number;
  number: number;
  ref: string;
  customer_id: number;
  enquiry_id: number | null;
  title: string;
  status: QuoteStatus;
  source: string;
  brief: string;
  intro_notes: string;
  exclusions: string;
  customer_questions: string;
  validity_days: number;
  valid_until: string | null;
  deposit_bp: number;
  vat_registered: number;
  vat_rate_bp: number;
  public_token: string;
  sent_at: string | null;
  first_viewed_at: string | null;
  last_viewed_at: string | null;
  accepted_at: string | null;
  accepted_name: string | null;
  accepted_option_id: number | null;
  declined_at: string | null;
  decline_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface LineRow {
  id: number;
  option_id: number;
  sort_order: number;
  description: string;
  quantity_x100: number;
  unit: string;
  unit_price_pence: number | null;
  price_item_id: number | null;
  needs_price: number;
  line_total_pence: number;
}

export interface OptionWithLines {
  id: number;
  name: string;
  sort_order: number;
  recommended: boolean;
  lines: (Omit<LineRow, 'needs_price'> & { needs_price: boolean })[];
  totals: Totals & { depositPence: number };
}

/** Quotes that can still be edited by the owner. */
export const EDITABLE: QuoteStatus[] = ['draft', 'sent', 'viewed'];

/** Mark sent/viewed quotes past their "valid until" date as expired. Cheap; run before reads. */
export function expireQuotes(db: DB, today = isoDate()): void {
  db.prepare(
    `UPDATE quotes SET status = 'expired', updated_at = ? WHERE status IN ('sent', 'viewed') AND valid_until IS NOT NULL AND valid_until < ?`,
  ).run(nowIso(), today);
}

function getRow(db: DB, id: number): QuoteRow {
  const row = db.prepare('SELECT * FROM quotes WHERE id = ?').get(id) as QuoteRow | undefined;
  if (!row) throw notFound('That quote');
  return row;
}

export function getRowByToken(db: DB, token: string): QuoteRow {
  // Tokens are 43 characters; anything else can't match, so don't bother the database.
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) throw notFound('That quote');
  const row = db.prepare('SELECT * FROM quotes WHERE public_token = ?').get(token) as QuoteRow | undefined;
  if (!row) throw notFound('That quote');
  return row;
}

function event(
  db: DB,
  quoteId: number,
  type: string,
  actor: 'owner' | 'customer' | 'system',
  detail: Record<string, unknown> = {},
  meta: { ip?: string; userAgent?: string } = {},
): void {
  db.prepare('INSERT INTO quote_events (quote_id, type, actor, detail, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?)').run(
    quoteId,
    type,
    actor,
    JSON.stringify(detail),
    meta.ip ?? null,
    meta.userAgent?.slice(0, 300) ?? null,
  );
}

// ---------------------------------------------------------------- Create & save

export function createQuote(
  db: DB,
  input: { customer_id: number; enquiry_id: number | null; source: string; brief: string; title: string },
): number {
  const customer = db.prepare('SELECT name FROM customers WHERE id = ?').get(input.customer_id) as { name: string } | undefined;
  if (!customer) throw notFound('That customer');
  if (input.enquiry_id !== null) {
    const enquiry = db.prepare('SELECT customer_id FROM enquiries WHERE id = ?').get(input.enquiry_id) as
      | { customer_id: number }
      | undefined;
    if (!enquiry || enquiry.customer_id !== input.customer_id) throw notFound('That enquiry');
  }
  const b = db
    .prepare('SELECT vat_registered, vat_rate_bp, default_validity_days, default_deposit_bp FROM business WHERE id = 1')
    .get() as { vat_registered: number; vat_rate_bp: number; default_validity_days: number; default_deposit_bp: number };

  return db.transaction(() => {
    const { number, ref } = takeNextRef(db, 'quote');
    const info = db
      .prepare(
        `INSERT INTO quotes (number, ref, customer_id, enquiry_id, title, source, brief, validity_days, deposit_bp,
           vat_registered, vat_rate_bp, public_token)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        number,
        ref,
        input.customer_id,
        input.enquiry_id,
        input.title || titleFromBrief(input.brief),
        input.source,
        input.brief,
        b.default_validity_days,
        b.default_deposit_bp,
        b.vat_registered,
        b.vat_rate_bp,
        newToken(),
      );
    const id = Number(info.lastInsertRowid);
    db.prepare(`INSERT INTO quote_options (quote_id, name, sort_order, recommended) VALUES (?, '', 0, 0)`).run(id);
    event(db, id, 'created', 'owner', { source: input.source });
    return id;
  })();
}

/** "Re-plaster the back bedroom, about 4 by 3 metres…" → "Re-plaster the back bedroom" */
export function titleFromBrief(brief: string): string {
  const firstClause = brief.trim().split(/[.,;\n]| - | – /)[0]?.trim() ?? '';
  if (!firstClause) return '';
  const short = firstClause.length > 60 ? `${firstClause.slice(0, 57).trimEnd()}…` : firstClause;
  return short[0].toUpperCase() + short.slice(1);
}

/** Replace a quote's content (options and lines) with what the owner has on screen. */
export function saveQuote(db: DB, id: number, input: QuoteSaveInput): void {
  const quote = getRow(db, id);
  if (!EDITABLE.includes(quote.status)) {
    throw new HttpError(409, `This quote has been ${quote.status}, so it can’t be changed.`);
  }
  // Only one recommended option.
  const recommendedIndex = input.options.findIndex((o) => o.recommended);
  db.transaction(() => {
    db.prepare(
      `UPDATE quotes SET title = ?, intro_notes = ?, exclusions = ?, validity_days = ?, deposit_bp = ?, updated_at = ? WHERE id = ?`,
    ).run(input.title, input.intro_notes, JSON.stringify(input.exclusions.filter((e) => e.trim())), input.validity_days, input.deposit_bp, nowIso(), id);
    db.prepare('DELETE FROM quote_options WHERE quote_id = ?').run(id);
    const insertOption = db.prepare('INSERT INTO quote_options (quote_id, name, sort_order, recommended) VALUES (?, ?, ?, ?)');
    const insertLine = db.prepare(
      `INSERT INTO quote_lines (option_id, sort_order, description, quantity_x100, unit, unit_price_pence, price_item_id, needs_price, line_total_pence)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    input.options.forEach((option, i) => {
      const optionId = Number(insertOption.run(id, option.name, i, i === recommendedIndex ? 1 : 0).lastInsertRowid);
      option.lines.forEach((line, j) => {
        const price = line.needs_price && line.unit_price_pence === null ? null : line.unit_price_pence;
        insertLine.run(
          optionId,
          j,
          line.description,
          line.quantity_x100,
          line.unit,
          price,
          validPriceItemId(db, line.price_item_id),
          price === null ? 1 : 0,
          price === null ? 0 : lineTotal(line.quantity_x100, price),
        );
      });
    });
  })();
}

function validPriceItemId(db: DB, id: number | null): number | null {
  if (id === null) return null;
  return db.prepare('SELECT 1 FROM price_items WHERE id = ?').get(id) ? id : null;
}

/** Add suggested lines (e.g. from the AI) to the first option, plus exclusions and questions. */
export function appendSuggestion(
  db: DB,
  id: number,
  suggestion: {
    title?: string;
    lines: { description: string; quantity_x100: number; unit: string; unit_price_pence: number | null; price_item_id: number | null }[];
    exclusions: string[];
    questions: string[];
  },
): void {
  const quote = getRow(db, id);
  if (!EDITABLE.includes(quote.status)) throw new HttpError(409, 'This quote can no longer be changed.');
  const option = db.prepare('SELECT id FROM quote_options WHERE quote_id = ? ORDER BY sort_order LIMIT 1').get(id) as { id: number };
  const start = (db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM quote_lines WHERE option_id = ?').get(option.id) as { n: number }).n;
  const insertLine = db.prepare(
    `INSERT INTO quote_lines (option_id, sort_order, description, quantity_x100, unit, unit_price_pence, price_item_id, needs_price, line_total_pence)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const exclusions = [...new Set([...(JSON.parse(quote.exclusions) as string[]), ...suggestion.exclusions])].slice(0, 30);
  const questions = [...new Set([...(JSON.parse(quote.customer_questions) as string[]), ...suggestion.questions])].slice(0, 20);
  db.transaction(() => {
    suggestion.lines.forEach((l, i) => {
      insertLine.run(
        option.id,
        start + i,
        l.description,
        l.quantity_x100,
        l.unit,
        l.unit_price_pence,
        l.price_item_id,
        l.unit_price_pence === null ? 1 : 0,
        l.unit_price_pence === null ? 0 : lineTotal(l.quantity_x100, l.unit_price_pence),
      );
    });
    db.prepare('UPDATE quotes SET exclusions = ?, customer_questions = ?, title = CASE WHEN ? != \'\' AND title = \'\' THEN ? ELSE title END, updated_at = ? WHERE id = ?').run(
      JSON.stringify(exclusions),
      JSON.stringify(questions),
      suggestion.title ?? '',
      suggestion.title ?? '',
      nowIso(),
      id,
    );
  })();
}

// ---------------------------------------------------------------- Read

export function optionsWithTotals(db: DB, quote: QuoteRow): OptionWithLines[] {
  const options = db
    .prepare('SELECT id, name, sort_order, recommended FROM quote_options WHERE quote_id = ? ORDER BY sort_order')
    .all(quote.id) as { id: number; name: string; sort_order: number; recommended: number }[];
  const linesStmt = db.prepare('SELECT * FROM quote_lines WHERE option_id = ? ORDER BY sort_order, id');
  return options.map((o) => {
    const lines = (linesStmt.all(o.id) as LineRow[]).map((l) => ({ ...l, needs_price: Boolean(l.needs_price) }));
    const totals = calculateTotals({
      lines: lines.map((l) => ({ quantityX100: l.quantity_x100, unitPricePence: l.unit_price_pence })),
      vatRegistered: Boolean(quote.vat_registered),
      vatRateBp: quote.vat_rate_bp,
    });
    return {
      ...o,
      recommended: Boolean(o.recommended),
      lines,
      totals: { ...totals, depositPence: depositAmount(totals.totalPence, quote.deposit_bp) },
    };
  });
}

/** The option whose total represents the quote in lists: accepted, else recommended, else first. */
export function headlineOption(options: OptionWithLines[], acceptedId: number | null): OptionWithLines | undefined {
  return options.find((o) => o.id === acceptedId) ?? options.find((o) => o.recommended) ?? options[0];
}

function photosFor(db: DB, quote: QuoteRow) {
  const rows = db
    .prepare(
      `SELECT id, owner_type, file_path, caption FROM attachments
       WHERE (owner_type = 'quote' AND owner_id = ?) OR (owner_type = 'enquiry' AND owner_id = ?)
       ORDER BY id`,
    )
    .all(quote.id, quote.enquiry_id ?? -1) as { id: number; owner_type: string; file_path: string; caption: string }[];
  return rows.map((p) => ({ id: p.id, from: p.owner_type, url: uploadUrl(p.file_path)!, caption: p.caption, file_path: p.file_path }));
}

/** Everything the owner's quote screen needs. */
export function getQuoteDetail(db: DB, id: number) {
  expireQuotes(db);
  const quote = getRow(db, id);
  const options = optionsWithTotals(db, quote);
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(quote.customer_id);
  const events = (db.prepare('SELECT * FROM quote_events WHERE quote_id = ? ORDER BY id').all(id) as { detail: string }[]).map((e) => ({
    ...e,
    detail: JSON.parse(e.detail),
  }));
  const messages = db.prepare('SELECT * FROM messages WHERE quote_id = ? ORDER BY id').all(id);
  return {
    quote: {
      ...quote,
      vat_registered: Boolean(quote.vat_registered),
      exclusions: JSON.parse(quote.exclusions) as string[],
      customer_questions: JSON.parse(quote.customer_questions) as string[],
      editable: EDITABLE.includes(quote.status),
    },
    options,
    customer,
    photos: photosFor(db, quote).map(({ file_path: _f, ...p }) => p),
    events,
    messages,
  };
}

export function photoFilesForAi(db: DB, id: number): { file_path: string }[] {
  return photosFor(db, getRow(db, id)).slice(-4);
}

export function listQuotes(db: DB, filter: { status?: string; q?: string; customerId?: number } = {}) {
  expireQuotes(db);
  const rows = db
    .prepare(
      `SELECT q.*, c.name AS customer_name FROM quotes q JOIN customers c ON c.id = q.customer_id
       WHERE (@status = '' OR q.status = @status OR (@status = 'open' AND q.status IN ('sent', 'viewed')))
         AND (@customerId = 0 OR q.customer_id = @customerId)
         AND (@q = '' OR c.name LIKE @like OR q.ref LIKE @like OR q.title LIKE @like)
       ORDER BY q.updated_at DESC LIMIT 300`,
    )
    .all({
      status: filter.status ?? '',
      customerId: filter.customerId ?? 0,
      q: filter.q ?? '',
      like: `%${filter.q ?? ''}%`,
    }) as (QuoteRow & { customer_name: string })[];
  return rows.map((q) => {
    const options = optionsWithTotals(db, q);
    const headline = headlineOption(options, q.accepted_option_id);
    return {
      id: q.id,
      ref: q.ref,
      title: q.title,
      status: q.status,
      customer_id: q.customer_id,
      customer_name: q.customer_name,
      total_pence: headline?.totals.totalPence ?? 0,
      option_count: options.length,
      needs_price: options.some((o) => o.totals.unpricedLines > 0),
      created_at: q.created_at,
      updated_at: q.updated_at,
      sent_at: q.sent_at,
      first_viewed_at: q.first_viewed_at,
      accepted_at: q.accepted_at,
      valid_until: q.valid_until,
    };
  });
}

// ---------------------------------------------------------------- Customer-facing view

/** What a customer sees at /q/:token. No private notes, no internal questions, no audit trail. */
export function publicQuoteView(db: DB, token: string) {
  expireQuotes(db);
  const quote = getRowByToken(db, token);
  const options = optionsWithTotals(db, quote);
  const customer = db.prepare('SELECT name, address_line1, address_line2, town, postcode FROM customers WHERE id = ?').get(quote.customer_id);
  const b = db.prepare('SELECT * FROM business WHERE id = 1').get() as Record<string, unknown>;
  return {
    quote: {
      ref: quote.ref,
      title: quote.title,
      status: quote.status,
      intro_notes: quote.intro_notes,
      exclusions: JSON.parse(quote.exclusions) as string[],
      validity_days: quote.validity_days,
      valid_until: quote.valid_until,
      deposit_bp: quote.deposit_bp,
      vat_registered: Boolean(quote.vat_registered),
      vat_rate_bp: quote.vat_rate_bp,
      created_at: quote.created_at,
      sent_at: quote.sent_at,
      accepted_at: quote.accepted_at,
      accepted_name: quote.accepted_name,
      accepted_option_id: quote.accepted_option_id,
      declined_at: quote.declined_at,
    },
    options: options.map((o) => ({
      id: o.id,
      name: o.name,
      recommended: o.recommended,
      totals: o.totals,
      // Unpriced lines never reach a customer (a quote can't be sent with them), but filter anyway.
      lines: o.lines
        .filter((l) => l.unit_price_pence !== null)
        .map((l) => ({
          id: l.id,
          description: l.description,
          quantity_x100: l.quantity_x100,
          unit: l.unit,
          unit_price_pence: l.unit_price_pence,
          line_total_pence: l.line_total_pence,
        })),
    })),
    customer,
    business: {
      name: b.name,
      brand_colour: b.brand_colour,
      logo_url: uploadUrl(b.logo_path as string | null),
      phone: b.phone,
      email: b.email,
      website: b.website,
      address: [b.address_line1, b.address_line2, b.town, b.postcode].filter(Boolean),
      vat_number: b.vat_registered ? b.vat_number : '',
      bank_name: b.bank_name,
      account_name: b.account_name,
      sort_code: b.sort_code,
      account_number: b.account_number,
      quote_terms: b.quote_terms,
    },
  };
}

// ---------------------------------------------------------------- Sending & customer actions

function customerOf(db: DB, quote: QuoteRow) {
  return db.prepare('SELECT * FROM customers WHERE id = ?').get(quote.customer_id) as {
    id: number;
    name: string;
    email: string;
    phone: string;
    address_line1: string;
  };
}

function quoteVars(db: DB, quote: QuoteRow, baseUrl: string) {
  const customer = customerOf(db, quote);
  const headline = headlineOption(optionsWithTotals(db, quote), quote.accepted_option_id);
  return {
    customer,
    vars: {
      ...businessVars(db),
      customer_name: customer.name,
      customer_first_name: firstName(customer.name),
      ref: quote.ref,
      title: quote.title ? quote.title.charAt(0).toLowerCase() + quote.title.slice(1) : 'your job',
      amount: formatMoney(headline?.totals.totalPence ?? 0),
      link: quoteLink(baseUrl, quote.public_token),
      valid_until: quote.valid_until ? formatDateLong(quote.valid_until) : '',
    } as Record<string, string>,
  };
}

export function sendQuote(db: DB, sender: MessageSender, id: number, baseUrl: string, today = new Date()) {
  expireQuotes(db);
  const quote = getRow(db, id);
  if (!EDITABLE.includes(quote.status)) throw new HttpError(409, `This quote has been ${quote.status}, so it can’t be sent again.`);
  const options = optionsWithTotals(db, quote);
  if (options.every((o) => o.lines.length === 0)) throw new HttpError(400, 'Add at least one line before sending.');
  const unpriced = options.reduce((n, o) => n + o.totals.unpricedLines, 0);
  if (unpriced > 0) {
    throw new HttpError(400, `${unpriced} line${unpriced === 1 ? ' needs a price' : 's need prices'} before you can send this quote.`);
  }

  const validUntil = isoDate(addDays(today, quote.validity_days));
  db.prepare(
    `UPDATE quotes SET status = CASE WHEN status = 'draft' THEN 'sent' ELSE status END, sent_at = ?, valid_until = ?, updated_at = ? WHERE id = ?`,
  ).run(nowIso(), validUntil, nowIso(), id);
  if (quote.enquiry_id) db.prepare(`UPDATE enquiries SET status = 'quoted' WHERE id = ?`).run(quote.enquiry_id);

  const fresh = getRow(db, id);
  const { customer, vars } = quoteVars(db, fresh, baseUrl);
  try {
    const result = sendTemplate(db, sender, 'quote_sent', customer, vars, {
      links: [{ label: `View quote ${fresh.ref}`, url: vars.link }],
      related_type: 'quote',
      related_id: id,
    });
    event(db, id, 'sent', 'owner', { channel: result.channel, to: result.address, resend: quote.status !== 'draft' });
    return result;
  } catch (err) {
    if (err instanceof NoContactDetailsError) {
      // Put things back: nothing was sent.
      db.prepare('UPDATE quotes SET status = ?, sent_at = ?, valid_until = ? WHERE id = ?').run(quote.status, quote.sent_at, quote.valid_until, id);
      throw new HttpError(400, `${err.message} Add one to the customer first.`);
    }
    throw err;
  }
}

export function nudgeQuote(db: DB, sender: MessageSender, id: number, baseUrl: string) {
  expireQuotes(db);
  const quote = getRow(db, id);
  if (!['sent', 'viewed'].includes(quote.status)) throw new HttpError(409, 'Only quotes waiting for an answer can be nudged.');
  const { customer, vars } = quoteVars(db, quote, baseUrl);
  try {
    const result = sendTemplate(db, sender, 'quote_reminder', customer, vars, {
      links: [{ label: `View quote ${quote.ref}`, url: vars.link }],
      related_type: 'quote',
      related_id: id,
    });
    event(db, id, 'nudged', 'owner', { channel: result.channel, to: result.address });
    db.prepare('UPDATE quotes SET updated_at = ? WHERE id = ?').run(nowIso(), id);
    return result;
  } catch (err) {
    if (err instanceof NoContactDetailsError) throw new HttpError(400, err.message);
    throw err;
  }
}

/** Who did it. byOwner is set when a logged-in owner acted on the customer's behalf. */
type Meta = { ip?: string; userAgent?: string; byOwner?: string };
const actorOf = (m: Meta) => (m.byOwner ? 'owner' : 'customer') as 'owner' | 'customer';
const onBehalf = (m: Meta) => (m.byOwner ? { on_behalf_of_customer: true, recorded_by: m.byOwner } : {});

/** The customer opened their link. */
export function recordView(db: DB, token: string, meta: Meta): void {
  const quote = getRowByToken(db, token);
  const now = nowIso();
  if (quote.status === 'sent') {
    db.prepare(`UPDATE quotes SET status = 'viewed', first_viewed_at = ?, last_viewed_at = ?, updated_at = ? WHERE id = ?`).run(now, now, now, quote.id);
    event(db, quote.id, 'viewed', 'customer', {}, meta);
    notifyOwner(db, { type: 'quote_viewed', title: `${customerOf(db, quote).name} opened ${quote.ref}`, link: `/quotes/${quote.id}` });
  } else if (['viewed', 'accepted', 'declined'].includes(quote.status)) {
    db.prepare('UPDATE quotes SET last_viewed_at = ? WHERE id = ?').run(now, quote.id);
  }
}

function assertOpen(quote: QuoteRow): void {
  if (quote.status === 'accepted') throw new HttpError(409, 'This quote has already been accepted. Thank you!');
  if (quote.status === 'declined') throw new HttpError(409, 'This quote has been declined.');
  if (quote.status === 'expired') throw new HttpError(409, 'This quote has expired. Please get in touch for an updated one.');
  if (quote.status === 'draft') throw new HttpError(409, 'This quote hasn’t been sent yet.');
}

export function acceptQuote(
  db: DB,
  sender: MessageSender,
  token: string,
  input: { name: string; option_id?: number },
  meta: Meta,
  baseUrl: string,
) {
  expireQuotes(db);
  const quote = getRowByToken(db, token);
  assertOpen(quote);
  const options = optionsWithTotals(db, quote);
  const option = input.option_id ? options.find((o) => o.id === input.option_id) : headlineOption(options, null);
  if (!option) throw new HttpError(400, 'Please choose one of the options.');

  const now = nowIso();
  db.prepare(
    `UPDATE quotes SET status = 'accepted', accepted_at = ?, accepted_name = ?, accepted_option_id = ?, updated_at = ? WHERE id = ?`,
  ).run(now, input.name, option.id, now, quote.id);
  event(
    db,
    quote.id,
    'accepted',
    actorOf(meta),
    { name: input.name, agreed_to_terms: true, option: option.name || null, total_pence: option.totals.totalPence, ...onBehalf(meta) },
    meta,
  );

  const customer = customerOf(db, quote);
  const amount = formatMoney(option.totals.totalPence);
  notifyOwner(db, {
    type: 'quote_accepted',
    title: `${customer.name} accepted ${quote.ref}`,
    body: `${amount}${option.name ? ` (${option.name})` : ''}. Accepted by ${input.name}.`,
    link: `/quotes/${quote.id}`,
  });
  const template = db.prepare(`SELECT subject, body FROM message_templates WHERE key = 'quote_accepted_owner'`).get() as
    | { subject: string; body: string }
    | undefined;
  const vars = { customer_name: customer.name, ref: quote.ref, amount };
  const fill = (s: string) => s.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: keyof typeof vars) => vars[k] ?? '');
  emailOwner(
    db,
    sender,
    template ? fill(template.subject) : `${customer.name} accepted ${quote.ref}`,
    template ? fill(template.body) : `${customer.name} accepted quote ${quote.ref} for ${amount}.`,
    { label: `Open ${quote.ref}`, url: `${baseUrl}/quotes/${quote.id}` },
  );
  return { quote_id: quote.id, option_id: option.id };
}

export function declineQuote(db: DB, sender: MessageSender, token: string, reason: string, meta: Meta, baseUrl: string) {
  expireQuotes(db);
  const quote = getRowByToken(db, token);
  assertOpen(quote);
  const now = nowIso();
  db.prepare(`UPDATE quotes SET status = 'declined', declined_at = ?, decline_reason = ?, updated_at = ? WHERE id = ?`).run(
    now,
    reason,
    now,
    quote.id,
  );
  event(db, quote.id, 'declined', actorOf(meta), { reason, ...onBehalf(meta) }, meta);
  const customer = customerOf(db, quote);
  notifyOwner(db, {
    type: 'quote_declined',
    title: `${customer.name} declined ${quote.ref}`,
    body: reason ? `“${reason}”` : 'No reason given.',
    link: `/quotes/${quote.id}`,
  });
  emailOwner(
    db,
    sender,
    `${customer.name} declined ${quote.ref}`,
    `${customer.name} declined quote ${quote.ref}.${reason ? `\n\nTheir reason: “${reason}”` : ''}`,
    { label: `Open ${quote.ref}`, url: `${baseUrl}/quotes/${quote.id}` },
  );
}

export function askQuestion(db: DB, sender: MessageSender, token: string, message: string, meta: Meta, baseUrl: string) {
  const quote = getRowByToken(db, token);
  if (quote.status === 'draft') throw new HttpError(409, 'This quote hasn’t been sent yet.');
  db.prepare(`INSERT INTO messages (quote_id, sender, body) VALUES (?, 'customer', ?)`).run(quote.id, message);
  event(db, quote.id, 'question', 'customer', { message }, meta);
  const customer = customerOf(db, quote);
  notifyOwner(db, { type: 'quote_question', title: `${customer.name} asked about ${quote.ref}`, body: message, link: `/quotes/${quote.id}` });
  emailOwner(db, sender, `Question about ${quote.ref} from ${customer.name}`, `${customer.name} asked:\n\n“${message}”`, {
    label: `Reply in the app`,
    url: `${baseUrl}/quotes/${quote.id}`,
  });
}

/** The owner replies to a customer's question; sent by email/text with the quote link. */
export function replyToCustomer(db: DB, sender: MessageSender, id: number, body: string, baseUrl: string) {
  const quote = getRow(db, id);
  const { customer, vars } = quoteVars(db, quote, baseUrl);
  db.prepare(`INSERT INTO messages (quote_id, sender, body) VALUES (?, 'owner', ?)`).run(id, body);
  if (customer.email || customer.phone) {
    sender.send({
      channel: customer.email ? 'email' : 'sms',
      to_name: customer.name,
      to_address: customer.email || customer.phone,
      subject: customer.email ? `Re: your quote ${quote.ref}` : '',
      body: `${customer.email ? `Hi ${vars.customer_first_name},\n\n` : ''}${body}\n\n${vars.link}\n\n${vars.owner_name}`,
      links: [{ label: `View quote ${quote.ref}`, url: vars.link }],
      template_key: 'reply',
      related_type: 'quote',
      related_id: id,
    });
  }
}

export function deleteDraft(db: DB, id: number): void {
  const quote = getRow(db, id);
  if (quote.status !== 'draft') throw new HttpError(409, 'Only drafts can be deleted. Sent quotes are kept for your records.');
  db.prepare('DELETE FROM quotes WHERE id = ?').run(id);
}
