import { isoDate } from '../../shared/format';
import { demoSuggestion } from '../services/ai/demo';
import { resolveSuggestion, type PriceListItem } from '../services/ai/suggestion';
import { SimulatedSender } from '../services/messaging';
import { acceptQuote, appendSuggestion, createQuote, declineQuote, recordView, saveQuote, sendQuote } from '../services/quotes';
import type { DB } from './db';

/** Quotes at different stages, built through the real code paths and then back-dated. */
type Plan = {
  enquiry: number; // index into the seeded enquiries (in insert order)
  sentDaysAgo?: number;
  viewedDaysAgo?: number;
  acceptedDaysAgo?: number;
  declinedDaysAgo?: number;
  declineReason?: string;
  acceptedBy?: string;
  options?: 'render';
  unpricedExtra?: string;
  question?: { daysAgo: number; text: string };
};

const PLANS: Plan[] = [
  { enquiry: 0, sentDaysAgo: 50, viewedDaysAgo: 50, acceptedDaysAgo: 48, acceptedBy: 'Susan Hirst' },
  { enquiry: 1, sentDaysAgo: 45, viewedDaysAgo: 44, acceptedDaysAgo: 41, acceptedBy: 'Mark Sykes' },
  { enquiry: 2, sentDaysAgo: 39, viewedDaysAgo: 38, acceptedDaysAgo: 36, acceptedBy: 'Priya Patel', question: { daysAgo: 38, text: 'Will you be able to keep the original cornice? It’s lovely.' } },
  { enquiry: 3, sentDaysAgo: 34, viewedDaysAgo: 33, declinedDaysAgo: 30, declineReason: 'Gone with my brother-in-law, sorry. Thanks for coming out.' },
  { enquiry: 4, sentDaysAgo: 28, viewedDaysAgo: 27, acceptedDaysAgo: 25, acceptedBy: 'Rachel Brook' },
  { enquiry: 5, sentDaysAgo: 23, viewedDaysAgo: 21, options: 'render' },
  { enquiry: 6, sentDaysAgo: 19, viewedDaysAgo: 19, acceptedDaysAgo: 18, acceptedBy: 'Margaret Lockwood' },
  { enquiry: 7, sentDaysAgo: 13, viewedDaysAgo: 12 },
  { enquiry: 8, sentDaysAgo: 9 },
  { enquiry: 9, unpricedExtra: 'Make good the hearth and fill the opening in the floor' },
];

function daysAgo(days: number, hour = 10, minute = 15): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

export function seedQuotes(db: DB): void {
  const sender = new SimulatedSender(db);
  const base = process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:5173';
  const priceList = db.prepare('SELECT * FROM price_items ORDER BY sort_order').all() as PriceListItem[];
  const enquiries = db.prepare('SELECT * FROM enquiries ORDER BY id').all() as { id: number; customer_id: number; description: string; received_at: string }[];
  const price = (name: string) => priceList.find((p) => p.name === name)!;

  for (const plan of PLANS) {
    const enquiry = enquiries[plan.enquiry];
    if (!enquiry) continue;
    const id = createQuote(db, { customer_id: enquiry.customer_id, enquiry_id: enquiry.id, source: plan.enquiry % 3 === 0 ? 'voice' : 'text', brief: enquiry.description, title: '' });

    if (plan.options === 'render') {
      const line = (name: string, qty: number, description?: string) => {
        const p = price(name);
        return { description: description ?? p.name, quantity_x100: qty * 100, unit: p.unit as 'm2', unit_price_pence: p.unit_price_pence, price_item_id: p.id, needs_price: false };
      };
      const prep = [line('Remove and dispose of old plaster', 40, 'Hack off old render and dispose'), line('Floor and furniture protection', 1, 'Protect paths, windows and plants')];
      saveQuote(db, id, {
        title: 'Re-render gable end',
        intro_notes: 'Thanks for showing me round, Tom. Three ways to do the gable, from a straight replacement to a low-maintenance coloured finish.',
        exclusions: ['Scaffolding (quoted separately once we know access)', 'Painting'],
        validity_days: 30,
        deposit_bp: 2500,
        options: [
          { name: 'Patch and repair', recommended: false, lines: [line('Pebbledash repair', 12, 'Patch and repair loose areas only'), line('Floor and furniture protection', 1, 'Protect paths, windows and plants')] },
          { name: 'Sand and cement render', recommended: true, lines: [...prep, line('Sand and cement render', 40)] },
          { name: 'Silicone coloured render', recommended: false, lines: [...prep, line('Silicone through-coloured render', 40)] },
        ],
      });
    } else {
      const s = resolveSuggestion(demoSuggestion(enquiry.description, priceList), priceList);
      // Sent quotes had their "check price" lines priced by the owner before sending.
      if (plan.sentDaysAgo !== undefined) {
        const owners: Record<string, number> = { 'Form doorway in new wall, including lining': 28000, 'Take off and refit radiator (plumber)': 9500, 'Scaffolding (if needed)': 45000 };
        for (const l of s.lines) if (l.unit_price_pence === null) l.unit_price_pence = owners[l.description] ?? 15000;
      }
      if (plan.unpricedExtra) s.lines.push({ description: plan.unpricedExtra, quantity_x100: 100, unit: 'item', unit_price_pence: null, price_item_id: null });
      appendSuggestion(db, id, s);
    }

    const token = (db.prepare('SELECT public_token FROM quotes WHERE id = ?').get(id) as { public_token: string }).public_token;
    if (plan.sentDaysAgo !== undefined) {
      // Sent "today" so it's still open for the steps below; dates are back-dated afterwards.
      sendQuote(db, sender, id, base);
      if (plan.viewedDaysAgo !== undefined) recordView(db, token, { userAgent: 'Mozilla/5.0 (iPhone)' });
      if (plan.question) {
        db.prepare(`INSERT INTO messages (quote_id, sender, body, created_at) VALUES (?, 'customer', ?, ?)`).run(id, plan.question.text, daysAgo(plan.question.daysAgo, 19, 40));
        db.prepare(`INSERT INTO messages (quote_id, sender, body, created_at) VALUES (?, 'owner', ?, ?)`).run(
          id,
          'Yes, we’ll protect it and work up to it. It won’t be touched.',
          daysAgo(plan.question.daysAgo - 1, 8, 5),
        );
      }
      if (plan.acceptedDaysAgo !== undefined) acceptQuote(db, sender, token, { name: plan.acceptedBy! }, { userAgent: 'Mozilla/5.0 (iPhone)' }, base);
      if (plan.declinedDaysAgo !== undefined) declineQuote(db, sender, token, plan.declineReason ?? '', {}, base);
    }

    // Back-date everything so the history looks real.
    const created = plan.sentDaysAgo !== undefined ? daysAgo(plan.sentDaysAgo, 8, 30) : daysAgo(1, 16, 20);
    const at: Record<string, string | null> = {
      created,
      sent: plan.sentDaysAgo !== undefined ? daysAgo(plan.sentDaysAgo, 8, 42) : null,
      viewed: plan.viewedDaysAgo !== undefined ? daysAgo(plan.viewedDaysAgo, 18, 12) : null,
      accepted: plan.acceptedDaysAgo !== undefined ? daysAgo(plan.acceptedDaysAgo, 20, 3) : null,
      declined: plan.declinedDaysAgo !== undefined ? daysAgo(plan.declinedDaysAgo, 12, 47) : null,
    };
    const updated = at.accepted ?? at.declined ?? at.viewed ?? at.sent ?? created;
    db.prepare(
      `UPDATE quotes SET created_at = ?, updated_at = ?, sent_at = ?, first_viewed_at = ?, last_viewed_at = ?, accepted_at = ?, declined_at = ? WHERE id = ?`,
    ).run(created, updated, at.sent, at.viewed, at.viewed, at.accepted, at.declined, id);
    const eventTime: Record<string, string | null> = { created: at.created, sent: at.sent, viewed: at.viewed, accepted: at.accepted, declined: at.declined };
    for (const [type, time] of Object.entries(eventTime)) {
      if (time) db.prepare('UPDATE quote_events SET created_at = ? WHERE quote_id = ? AND type = ?').run(time, id, type);
    }
    if (at.sent) db.prepare(`UPDATE outbox SET created_at = ? WHERE related_type = 'quote' AND related_id = ?`).run(at.sent, id);
    // Owner alerts and notifications from this quote: time them to the customer's action.
    const alertTime = at.accepted ?? at.declined ?? at.viewed;
    if (alertTime) {
      db.prepare(`UPDATE outbox SET created_at = ? WHERE related_type IS NULL AND created_at > ? AND template_key = 'owner_alert'`).run(alertTime, daysAgo(0, 0, 0));
      db.prepare(`UPDATE notifications SET created_at = ?, read_at = ? WHERE created_at > ? AND link = ?`).run(
        alertTime,
        (plan.sentDaysAgo ?? 0) > 14 ? alertTime : null,
        daysAgo(0, 0, 0),
        `/quotes/${id}`,
      );
    }
  }

  // Valid-until dates follow the back-dated send dates.
  db.prepare(`UPDATE quotes SET valid_until = date(sent_at, '+' || validity_days || ' days') WHERE sent_at IS NOT NULL`).run();
  db.prepare(`UPDATE quotes SET status = 'expired' WHERE status IN ('sent', 'viewed') AND valid_until < ?`).run(isoDate());
}
