import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { formatDateLong, formatMoney, unitLabel } from '../../shared/format';
import { bpToPercent, quantityToInput } from '../../shared/money';
import { UPLOADS_DIR, type DB } from '../db/db';
import { publicQuoteView } from './quotes';

const INK = '#1b1d20';
const MUTED = '#6e7680';
const LINE = '#e4e1da';

/**
 * Branded quote PDF. Totals come from the same calculation as the screen and the
 * customer page (shared/money.ts), so they always match.
 */
export function renderQuotePdf(db: DB, token: string, uploadsDir: string = UPLOADS_DIR): Promise<Buffer> {
  const { quote, options, customer, business } = publicQuoteView(db, token);
  const c = customer as { name: string; address_line1: string; address_line2: string; town: string; postcode: string };
  const brand = String(business.brand_colour);

  const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: `Quote ${quote.ref}`, Author: String(business.name) } });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const left = 48;
  const right = doc.page.width - 48;
  const width = right - left;

  // Brand bar
  doc.rect(0, 0, doc.page.width, 8).fill(brand);

  // Header: logo (PNG/JPEG only) or name, and business details
  let y = 40;
  const logoFile = business.logo_url ? path.join(uploadsDir, path.basename(String(business.logo_url))) : null;
  let logoDrawn = false;
  if (logoFile && /\.(png|jpe?g)$/i.test(logoFile) && fs.existsSync(logoFile)) {
    try {
      doc.image(logoFile, left, y, { fit: [110, 60] });
      logoDrawn = true;
    } catch {
      /* unreadable image: fall back to the name */
    }
  }
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(logoDrawn ? 13 : 18);
  doc.text(String(business.name), logoDrawn ? left + 124 : left, logoDrawn ? y + 4 : y, { width: 260 });
  doc.font('Helvetica').fontSize(9).fillColor(MUTED);
  const contact = [...(business.address as string[]), business.phone, business.email, business.website].filter(Boolean).join('\n');
  doc.text(contact, right - 200, y, { width: 200, align: 'right' });

  // Title block
  y = Math.max(doc.y, 120) + 16;
  doc.fillColor(brand).font('Helvetica-Bold').fontSize(24).text('Quote', left, y);
  doc.fillColor(INK).fontSize(11).text(quote.ref, left, doc.y + 2);

  const meta: [string, string][] = [
    ['Date', formatDateLong(quote.sent_at ?? quote.created_at)],
    ...(quote.valid_until ? ([['Valid until', formatDateLong(quote.valid_until)]] as [string, string][]) : []),
  ];
  let my = y + 4;
  for (const [label, value] of meta) {
    doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(label, right - 200, my, { width: 90 });
    doc.font('Helvetica-Bold').fillColor(INK).text(value, right - 110, my, { width: 110, align: 'right' });
    my += 15;
  }

  // Customer
  y = Math.max(doc.y, my) + 18;
  doc.font('Helvetica').fontSize(9).fillColor(MUTED).text('Prepared for', left, y);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(INK).text(c.name, left, doc.y + 2);
  doc.font('Helvetica').fontSize(10).text([c.address_line1, c.address_line2, c.town, c.postcode].filter(Boolean).join(', '), { width: width / 2 });

  if (quote.title) {
    doc.moveDown(1);
    doc.font('Helvetica-Bold').fontSize(13).fillColor(INK).text(quote.title, left);
  }
  if (quote.intro_notes) {
    doc.moveDown(0.4);
    doc.font('Helvetica').fontSize(10).fillColor(INK).text(quote.intro_notes, left, doc.y, { width });
  }

  const ensureSpace = (needed: number) => {
    if (doc.y + needed > doc.page.height - 60) {
      doc.addPage();
      doc.rect(0, 0, doc.page.width, 4).fill(brand);
      doc.y = 48;
    }
  };

  // Columns: description | qty | unit price | total
  const colQty = left + width * 0.55;
  const colPrice = left + width * 0.7;
  const colTotal = left + width * 0.85;

  options.forEach((option) => {
    doc.moveDown(1.2);
    // Keep an option's table and its totals on the same page when they fit on one.
    doc.font('Helvetica').fontSize(10);
    const linesHeight = option.lines.reduce((h, l) => h + doc.heightOfString(l.description, { width: colQty - left - 16 }) + 8, 0);
    const optionHeight = (options.length > 1 ? 24 : 0) + 26 + linesHeight + 100;
    const usable = doc.page.height - 48 - 60;
    ensureSpace(optionHeight <= usable ? optionHeight : 80);
    if (options.length > 1) {
      doc.font('Helvetica-Bold').fontSize(12).fillColor(brand).text(`${option.name || 'Option'}${option.recommended ? '  (recommended)' : ''}`, left);
      doc.moveDown(0.3);
    }
    let ty = doc.y;
    doc.rect(left, ty, width, 20).fill('#f5f4f0');
    doc.font('Helvetica-Bold').fontSize(9).fillColor(MUTED);
    doc.text('Description', left + 8, ty + 6);
    doc.text('Qty', colQty, ty + 6, { width: colPrice - colQty - 8, align: 'right' });
    doc.text('Price', colPrice, ty + 6, { width: colTotal - colPrice - 8, align: 'right' });
    doc.text('Total', colTotal, ty + 6, { width: right - colTotal - 8, align: 'right' });
    doc.y = ty + 26;

    for (const line of option.lines) {
      const h = doc.font('Helvetica').fontSize(10).heightOfString(line.description, { width: colQty - left - 16 });
      ensureSpace(h + 14);
      ty = doc.y;
      doc.fillColor(INK).text(line.description, left + 8, ty, { width: colQty - left - 16 });
      const qty = `${quantityToInput(line.quantity_x100)} ${line.unit === 'item' ? '' : unitLabel(line.unit)}`.trim();
      doc.text(qty, colQty, ty, { width: colPrice - colQty - 8, align: 'right' });
      doc.text(formatMoney(line.unit_price_pence ?? 0), colPrice, ty, { width: colTotal - colPrice - 8, align: 'right' });
      doc.font('Helvetica-Bold').text(formatMoney(line.line_total_pence), colTotal, ty, { width: right - colTotal - 8, align: 'right' });
      doc.y = ty + h + 8;
      doc.moveTo(left, doc.y - 4).lineTo(right, doc.y - 4).strokeColor(LINE).lineWidth(0.5).stroke();
    }

    // Totals
    ensureSpace(90);
    const rows: [string, string, boolean][] = [['Subtotal', formatMoney(option.totals.subtotalPence), false]];
    if (quote.vat_registered) rows.push([`VAT at ${bpToPercent(quote.vat_rate_bp)}%`, formatMoney(option.totals.vatPence), false]);
    rows.push([quote.vat_registered ? 'Total including VAT' : 'Total', formatMoney(option.totals.totalPence), true]);
    if (quote.deposit_bp > 0) rows.push([`Deposit (${bpToPercent(quote.deposit_bp)}%)`, formatMoney(option.totals.depositPence), false]);
    let ry = doc.y + 6;
    for (const [label, value, bold] of rows) {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 12 : 10).fillColor(bold ? brand : INK);
      doc.text(label, colQty - 40, ry, { width: colTotal - colQty + 30, align: 'right' });
      doc.text(value, colTotal, ry, { width: right - colTotal - 8, align: 'right' });
      ry += bold ? 20 : 16;
    }
    doc.y = ry;
  });

  const section = (title: string, body: string) => {
    if (!body.trim()) return;
    doc.moveDown(1);
    ensureSpace(60);
    doc.font('Helvetica-Bold').fontSize(11).fillColor(INK).text(title, left);
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(9.5).fillColor(INK).text(body, left, doc.y, { width });
  };

  section('Not included', quote.exclusions.map((e) => `•  ${e}`).join('\n'));
  if (quote.deposit_bp > 0 && business.account_number) {
    section(
      'Paying your deposit',
      `To book your start date, please pay the deposit by bank transfer:\n${business.account_name}\nSort code ${business.sort_code}   Account ${business.account_number}\nReference: ${quote.ref}`,
    );
  }
  section('Terms', String(business.quote_terms ?? '').split('\n').filter(Boolean).map((t) => `•  ${t}`).join('\n'));

  doc.moveDown(1.5);
  ensureSpace(40);
  doc.font('Helvetica').fontSize(8.5).fillColor(MUTED);
  const footer = [business.vat_number ? `VAT number ${business.vat_number}` : '', `Accept this quote online, or call ${business.phone || 'us'}.`].filter(Boolean);
  doc.text(footer.join('   ·   '), left, doc.y, { width, align: 'center' });

  doc.end();
  return done;
}
