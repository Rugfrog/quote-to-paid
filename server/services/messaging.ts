import type { DB } from '../db/db';

/**
 * Everything the app sends to customers (or to the owner) goes through a MessageSender.
 * The demo uses SimulatedSender, which writes to the outbox table so you can show exactly
 * what would be sent. To go live, add e.g. an EmailSender that calls a real provider and
 * pass it to createApp instead.
 */
export interface OutgoingMessage {
  channel: 'email' | 'sms';
  to_name: string;
  to_address: string;
  subject: string;
  body: string;
  links: { label: string; url: string }[];
  template_key?: string;
  related_type?: string;
  related_id?: number;
}

export interface MessageSender {
  /** Returns the outbox id of the stored message. */
  send(message: OutgoingMessage): number;
}

export class SimulatedSender implements MessageSender {
  constructor(private db: DB) {}

  send(m: OutgoingMessage): number {
    const info = this.db
      .prepare(
        `INSERT INTO outbox (channel, to_name, to_address, subject, body, links, template_key, related_type, related_id, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'simulated')`,
      )
      .run(
        m.channel,
        m.to_name,
        m.to_address,
        m.subject,
        m.body,
        JSON.stringify(m.links),
        m.template_key ?? null,
        m.related_type ?? null,
        m.related_id ?? null,
      );
    return Number(info.lastInsertRowid);
  }
}

/** Replace {{placeholders}}. Unknown placeholders become empty, never "undefined". */
export function fillTemplate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => vars[key] ?? '');
}

export interface Recipient {
  name: string;
  email: string;
  phone: string;
}

export class NoContactDetailsError extends Error {}

/**
 * Send a stored template to someone. Uses email if we have one, otherwise a short text
 * message. Throws NoContactDetailsError if there's neither.
 */
export function sendTemplate(
  db: DB,
  sender: MessageSender,
  key: string,
  to: Recipient,
  vars: Record<string, string>,
  options: { links?: { label: string; url: string }[]; related_type?: string; related_id?: number } = {},
): { outboxId: number; channel: 'email' | 'sms'; address: string } {
  const template = db.prepare('SELECT subject, body FROM message_templates WHERE key = ?').get(key) as
    | { subject: string; body: string }
    | undefined;
  if (!template) throw new Error(`Missing message template: ${key}`);

  const subject = fillTemplate(template.subject, vars);
  const links = options.links ?? (vars.link ? [{ label: 'Open link', url: vars.link }] : []);

  let channel: 'email' | 'sms';
  let address: string;
  let body: string;
  if (to.email) {
    channel = 'email';
    address = to.email;
    body = fillTemplate(template.body, vars);
  } else if (to.phone) {
    // Texts are kept short: the subject line, the link, and who it's from.
    channel = 'sms';
    address = to.phone;
    body = [`Hi ${vars.customer_first_name || to.name}, ${lowerFirst(subject)}.`, vars.link, `${vars.business_name}`]
      .filter(Boolean)
      .join('\n');
  } else {
    throw new NoContactDetailsError(`${to.name} has no email address or mobile number.`);
  }

  const outboxId = sender.send({
    channel,
    to_name: to.name,
    to_address: address,
    subject: channel === 'email' ? subject : '',
    body,
    links,
    template_key: key,
    related_type: options.related_type,
    related_id: options.related_id,
  });
  return { outboxId, channel, address };
}

function lowerFirst(s: string): string {
  return s ? s[0].toLowerCase() + s.slice(1) : s;
}

/** Placeholders every template can use. */
export function businessVars(db: DB): Record<string, string> {
  const b = db.prepare('SELECT name, phone, email, owner_name FROM business WHERE id = 1').get() as {
    name: string;
    phone: string;
    email: string;
    owner_name: string;
  };
  return { business_name: b.name, business_phone: b.phone, business_email: b.email, owner_name: b.owner_name || b.name };
}

export function firstName(name: string): string {
  // "Kirklees Lettings (example)" isn't a person: use the whole name.
  const first = name.trim().split(/\s+/)[0] ?? name;
  return /ltd|lettings|limited|\(/i.test(name) ? name : first;
}

/** In-app notification for the owner. */
export function notifyOwner(db: DB, n: { type: string; title: string; body?: string; link?: string }): void {
  db.prepare('INSERT INTO notifications (type, title, body, link) VALUES (?, ?, ?, ?)').run(n.type, n.title, n.body ?? '', n.link ?? null);
}

/** Email the owner (simulated) — e.g. "Susan accepted Q-0012". Skipped if the business has no email. */
export function emailOwner(db: DB, sender: MessageSender, subject: string, body: string, link?: { label: string; url: string }): void {
  const b = db.prepare('SELECT name, email, owner_name FROM business WHERE id = 1').get() as { name: string; email: string; owner_name: string };
  if (!b.email) return;
  sender.send({
    channel: 'email',
    to_name: b.owner_name || b.name,
    to_address: b.email,
    subject,
    body,
    links: link ? [link] : [],
    template_key: 'owner_alert',
  });
}
